import type {Page} from '@playwright/test';
import {test, expect, nextApiRequest} from '../../fixtures/test';
import {seedExerciseGoal} from '../../fixtures/db';
import {todayIn, weekdayIn} from '../../fixtures/dates';
import {card, exerciseProgress, logRow, openQuickLog} from '../../fixtures/ui';

async function openPlan(page: Page) {
  await page.goto('/dashboard');
  const panel = await openQuickLog(page, 'exercise');
  return {panel, plan: card(panel, "Today's plan")};
}

test.beforeEach(async ({db, user}) => {
  await seedExerciseGoal(db, user.id, {
    name: 'Squats',
    sets: 3,
    reps: 10,
    calories: 100,
    notes: 'Chest up',
  });
  await seedExerciseGoal(db, user.id, {
    name: 'Jog',
    type: 'TIME',
    durationMin: 20,
    sets: null,
    reps: null,
    calories: 150,
  });
  await seedExerciseGoal(db, user.id, {name: 'Tomorrow only', days: [(weekdayIn() + 1) % 7]});
});

test("TP-01/02 today's plan lists only today's goals", async ({authedPage: page}) => {
  const {panel, plan} = await openPlan(page);
  await expect(plan.getByText('0 of 2 done')).toBeVisible();
  await expect(plan.getByRole('link', {name: 'View logs'})).toBeVisible();

  const squats = plan.getByRole('listitem').filter({hasText: 'Squats'});
  await expect(squats).toContainText('3 × 10 · 100 kcal');
  await expect(squats).toContainText('Chest up');
  await expect(squats.getByRole('checkbox', {name: 'Mark Squats as done'})).not.toBeChecked();
  await expect(squats.getByRole('button', {name: 'Start Squats'})).toBeVisible();
  await expect(plan.getByRole('listitem').filter({hasText: 'Jog'})).toContainText(
    '20 min · 150 kcal',
  );
  await expect(plan.getByText('Tomorrow only')).toHaveCount(0);

  // The custom form stays tucked away until asked for.
  await expect(panel.getByRole('heading', {name: 'Add custom exercise'})).toHaveCount(0);
  await panel.getByRole('button', {name: 'Log custom exercise'}).click();
  await expect(panel.getByRole('heading', {name: 'Add custom exercise'})).toBeVisible();
});

test('TP-03/04 ticking logs the goal and updates progress', async ({
  authedPage: page,
  db,
  user,
}) => {
  const {panel, plan} = await openPlan(page);

  const request = nextApiRequest(page, '/api/exercise-goals/log');
  // Controlled: the box only flips once the API answers, so click rather than check().
  await plan.getByRole('checkbox', {name: 'Mark Squats as done'}).click();
  const sent = await request;
  const goal = await db.exerciseGoal.findFirst({where: {userId: user.id, name: 'Squats'}});
  expect(sent.postDataJSON()).toEqual({goalId: goal!.id});
  const response = await sent.response();
  expect(response?.status()).toBe(201);
  expect(await response?.json()).toMatchObject({
    exerciseGoalId: goal!.id,
    goalDate: todayIn(),
    name: 'Squats',
  });

  // Done goals drop out of the quick-log list.
  await expect(plan.getByText('1 of 2 done')).toBeVisible();
  await expect(plan.getByText('Squats')).toHaveCount(0);
  await expect(exerciseProgress(page)).toHaveAttribute('aria-valuenow', '1');

  await plan.getByRole('checkbox', {name: 'Mark Jog as done'}).click();
  await expect(plan.getByText('All planned exercises done.')).toBeVisible();
  await expect(plan.getByText('2 of 2 done')).toBeVisible();
  await panel.getByRole('button', {name: 'Close'}).click();
  await expect(exerciseProgress(page)).toContainText('2/2');

  await page.goto('/logs?tab=exercise');
  await expect(logRow(page, 'Squats')).toContainText('3 × 10 · Planned');
  await expect(logRow(page, 'Jog')).toContainText('20 min · Planned');
});

test('TP-09 failed ticks show an error and stay unticked', async ({authedPage: page}) => {
  await page.route('**/api/exercise-goals/log', (route) =>
    route.fulfill({status: 500, json: {error: 'Failed to log planned exercise'}}),
  );
  const {plan} = await openPlan(page);
  const checkbox = plan.getByRole('checkbox', {name: 'Mark Jog as done'});
  await checkbox.click();
  await expect(plan.getByRole('alert')).toHaveText('Failed to log planned exercise');
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeEnabled();
});

test('TP-09 controls are disabled while a tick is saving', async ({authedPage: page}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/exercise-goals/log', async (route) => {
    await held;
    await route.continue();
  });
  const {plan} = await openPlan(page);
  await plan.getByRole('checkbox', {name: 'Mark Jog as done'}).click();
  await expect(plan.getByRole('checkbox', {name: 'Mark Jog as done'})).toBeDisabled();
  await expect(plan.getByRole('button', {name: 'Start Jog'})).toBeDisabled();
  // Other goals stay usable.
  await expect(plan.getByRole('button', {name: 'Start Squats'})).toBeEnabled();
  release();
  await expect(plan.getByText('1 of 2 done')).toBeVisible();
});
