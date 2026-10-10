import type {Locator, Page} from '@playwright/test';
import {test, expect} from '../../fixtures/test';
import {signInOrThrow} from '../../fixtures/auth';
import {seedExercise, seedExerciseGoal, seedFood, seedWeight} from '../../fixtures/db';
import {chartLabel, daysAgoIn, noonDaysAgo, todayIn} from '../../fixtures/dates';
import {
  calorieSummary,
  card,
  dialog,
  exerciseProgress,
  limitBar,
  macroRing,
  openQuickLog,
} from '../../fixtures/ui';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hovers a chart's day column and returns its tooltip. */
async function hoverDay(page: Page, chartCard: Locator, label: string) {
  // Mouse coordinates are viewport-relative, so the chart must be on screen.
  await chartCard.scrollIntoViewIfNeeded();
  const tick = chartCard
    .locator('.recharts-cartesian-axis-tick-value')
    .filter({hasText: label});
  const tickBox = await tick.boundingBox();
  const surface = await chartCard.locator('svg.recharts-surface').first().boundingBox();
  if (!tickBox || !surface) throw new Error(`No chart column for ${label}`);
  await page.mouse.move(tickBox.x + tickBox.width / 2, surface.y + surface.height / 2, {
    steps: 2,
  });
  return chartCard.locator('.recharts-tooltip-wrapper');
}

test('DSH-01 empty state for a new user', async ({authedPage: page}) => {
  await page.goto('/dashboard');

  const calories = calorieSummary(page);
  await expect(calories.remaining).toHaveText('2000');
  await expect(calories.caption).toHaveText('remaining');
  await expect(calories.ratio).toHaveText('0 / 2000');
  await expect(calories.eaten).toHaveText('0');
  await expect(calories.burned).toHaveText('0');

  const exercise = exerciseProgress(page);
  await expect(exercise).toHaveAttribute('aria-valuenow', '0');
  await expect(exercise).toHaveAttribute('aria-valuemax', '0');
  await expect(exercise).toContainText('–');
  await expect(exercise).toContainText('none planned');

  for (const [label, goal] of [['Protein', 150], ['Carbs', 250], ['Fat', 70]] as const) {
    const ring = macroRing(page, label);
    await expect(ring.remaining).toHaveText(String(goal));
    await expect(ring.caption).toHaveText('left');
    await expect(ring.ratio).toHaveText(`0 / ${goal}`);
  }

  const satFat = limitBar(page);
  await expect(satFat.status).toHaveText('20g remaining');
  await expect(satFat.ratio).toHaveText('0 / 20g');

  await expect(card(page, 'Exercise this week')).toContainText(
    'No exercise planned or logged this week',
  );
  for (const title of ['Calories this week', 'Protein this week', 'Weight trend']) {
    await expect(card(page, title).locator('svg.recharts-surface').first()).toBeVisible();
  }
});

test('DSH-02 totals come from today’s food and exercise', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedFood(db, user.id, {calories: 500, protein: 30, carbs: 40, fat: 20, saturatedFat: 5});
  await seedExercise(db, user.id, {calories: 200});
  await page.goto('/dashboard');

  const calories = calorieSummary(page);
  await expect(calories.remaining).toHaveText('1700');
  await expect(calories.ratio).toHaveText('300 / 2000');
  await expect(calories.eaten).toHaveText('500');
  await expect(calories.burned).toHaveText('200');

  await expect(macroRing(page, 'Protein').remaining).toHaveText('120');
  await expect(macroRing(page, 'Protein').ratio).toHaveText('30 / 150');
  await expect(macroRing(page, 'Carbs').ratio).toHaveText('40 / 250');
  await expect(macroRing(page, 'Fat').remaining).toHaveText('50');
  await expect(limitBar(page).status).toHaveText('15g remaining');
});

test('DSH-03 going over a goal is flagged', async ({authedPage: page, db, user}) => {
  await seedFood(db, user.id, {calories: 2500, protein: 200, fat: 80, saturatedFat: 25});
  await page.goto('/dashboard');

  const calories = calorieSummary(page);
  await expect(calories.remaining).toHaveText('500');
  await expect(calories.caption).toHaveText('over goal');
  await expect(calories.remaining).toHaveClass(/text-destructive/);

  const protein = macroRing(page, 'Protein');
  await expect(protein.remaining).toHaveText('50');
  await expect(protein.caption).toHaveText('over');
  await expect(limitBar(page).status).toHaveText('5g over limit');
});

test('DSH-04 decimal totals have no float artifacts', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedFood(db, user.id, {calories: 0.1, protein: 0.1});
  await seedFood(db, user.id, {calories: 0.2, protein: 0.2});
  await page.goto('/dashboard');
  await expect(macroRing(page, 'Protein').ratio).toHaveText('0.3 / 150');
  await expect(macroRing(page, 'Protein').remaining).toHaveText('149.7');
  await expect(calorieSummary(page).eaten).toHaveText('0.3');
});

test('DSH-05 custom goals are used', async ({page, makeUser, db}) => {
  const user = await makeUser({goals: {calorieGoal: 1800, proteinGoal: 100}});
  await seedFood(db, user.id, {calories: 300});
  await signInOrThrow(page.context().request, user.email, user.password);
  await page.goto('/dashboard');
  await expect(calorieSummary(page).ratio).toHaveText('300 / 1800');
  await expect(macroRing(page, 'Protein').ratio).toHaveText('0 / 100');
});

test('DSH-06 yesterday counts in the week, not today', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedFood(db, user.id, {calories: 900, protein: 45, loggedAt: noonDaysAgo(1)});
  await page.goto('/dashboard');

  await expect(calorieSummary(page).ratio).toHaveText('0 / 2000');

  const caloriesChart = card(page, 'Calories this week');
  const labels = caloriesChart.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value');
  await expect(labels).toHaveText(
    [6, 5, 4, 3, 2, 1, 0].map((days) => chartLabel(daysAgoIn(days))),
  );
  const tooltip = await hoverDay(page, caloriesChart, chartLabel(daysAgoIn(1)));
  await expect(tooltip).toContainText('calories : 900');

  const proteinTooltip = await hoverDay(
    page,
    card(page, 'Protein this week'),
    chartLabel(daysAgoIn(1)),
  );
  await expect(proteinTooltip).toContainText('protein : 45');
});

test('DSH-06b net calories subtract exercise in the weekly chart', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedFood(db, user.id, {calories: 1000, loggedAt: noonDaysAgo(2)});
  await seedExercise(db, user.id, {calories: 300, loggedAt: noonDaysAgo(2)});
  await page.goto('/dashboard');
  const tooltip = await hoverDay(
    page,
    card(page, 'Calories this week'),
    chartLabel(daysAgoIn(2)),
  );
  await expect(tooltip).toContainText('calories : 700');
});

test('DSH-07 exercise ring counts ticked planned exercises', async ({
  authedPage: page,
  db,
  user,
}) => {
  const [first] = await Promise.all([
    seedExerciseGoal(db, user.id, {name: 'A'}),
    seedExerciseGoal(db, user.id, {name: 'B'}),
    seedExerciseGoal(db, user.id, {name: 'C'}),
  ]);
  await seedExercise(db, user.id, {name: 'A', exerciseGoalId: first.id, goalDate: todayIn()});
  await page.goto('/dashboard');

  const exercise = exerciseProgress(page);
  await expect(exercise).toHaveAttribute('aria-valuenow', '1');
  await expect(exercise).toHaveAttribute('aria-valuemax', '3');
  await expect(exercise).toContainText('1/3');
  await expect(exercise).toContainText('done');
});

test('DSH-08 exercise chart: done, missed, extra and rest days', async ({
  authedPage: page,
  db,
  user,
}) => {
  const createdAt = new Date(Date.now() - 3 * DAY_MS);
  const goal = await seedExerciseGoal(db, user.id, {name: 'Plank', createdAt});
  await seedExerciseGoal(db, user.id, {name: 'Squat', createdAt});
  await seedExercise(db, user.id, {name: 'Plank', exerciseGoalId: goal.id, goalDate: todayIn()});
  await seedExercise(db, user.id, {name: 'Walk'});
  await page.goto('/dashboard');

  const chart = card(page, 'Exercise this week');
  await expect(chart.locator('.recharts-legend-item-text')).toHaveText([
    'Done',
    'Missed',
    'Extra',
  ]);

  let tooltip = await hoverDay(page, chart, chartLabel(todayIn()));
  await expect(tooltip).toContainText('Today');
  await expect(tooltip).toContainText('1 of 2 planned done (50%)');
  await expect(tooltip).toContainText('1 remaining');
  await expect(tooltip).toContainText('1 extra');

  tooltip = await hoverDay(page, chart, chartLabel(daysAgoIn(1)));
  await expect(tooltip).toContainText(chartLabel(daysAgoIn(1)));
  await expect(tooltip).toContainText('0 of 2 planned done (0%)');
  await expect(tooltip).toContainText('2 missed');

  // Before the goals existed.
  tooltip = await hoverDay(page, chart, chartLabel(daysAgoIn(5)));
  await expect(tooltip).toContainText('Rest day');
});

test('DSH-09 frozen plan history survives deleted goals', async ({
  authedPage: page,
  db,
  user,
}) => {
  await db.exercisePlanDay.create({
    data: {userId: user.id, date: daysAgoIn(2), plannedCount: 2},
  });
  await page.goto('/dashboard');
  const chart = card(page, 'Exercise this week');
  const tooltip = await hoverDay(page, chart, chartLabel(daysAgoIn(2)));
  await expect(tooltip).toContainText('0 of 2 planned done (0%)');
  await expect(tooltip).toContainText('2 missed');
});

test('DSH-10 weight chart shows the latest seven entries', async ({
  authedPage: page,
  db,
  user,
}) => {
  for (let days = 8; days >= 0; days--) {
    await seedWeight(db, user.id, {weight: 80 - days / 2, loggedAt: noonDaysAgo(days)});
  }
  await page.goto('/dashboard');
  const chart = card(page, 'Weight trend');
  await expect(chart.locator('.recharts-area-dots circle')).toHaveCount(7);
  await expect(chart.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').last()).toHaveText(
    chartLabel(todayIn()),
  );
});

test.describe('DSH-11 quick log dialogs', () => {
  for (const panel of ['food', 'exercise', 'weight'] as const) {
    test(`${panel}: opens, closes and links to logs`, async ({authedPage: page}) => {
      await page.goto('/dashboard');

      let panelDialog = await openQuickLog(page, panel);
      await expect(panelDialog).toBeVisible();
      await panelDialog.getByRole('button', {name: 'Close'}).click();
      await expect(panelDialog).toBeHidden();

      panelDialog = await openQuickLog(page, panel);
      await page.keyboard.press('Escape');
      await expect(panelDialog).toBeHidden();

      panelDialog = await openQuickLog(page, panel);
      await panelDialog.getByRole('link', {name: 'View logs'}).click();
      await expect(page).toHaveURL(`/logs?tab=${panel}`);
      await expect(dialog(page, `Log ${panel}`)).toHaveCount(0);
    });
  }
});
