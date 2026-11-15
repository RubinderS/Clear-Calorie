import type {Page} from '@playwright/test';
import {test, expect, nextApiRequest, trackRequests} from '../../fixtures/test';
import {seedExerciseGoal} from '../../fixtures/db';
import {todayIn, weekdayIn} from '../../fixtures/dates';
import {card, exerciseProgress, logPlanned, logRow, openQuickLog} from '../../fixtures/ui';

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
    notes: 'Chest up',
  });
  await seedExerciseGoal(db, user.id, {
    name: 'Jog',
    type: 'TIME',
    durationMin: 20,
    sets: null,
    reps: null,
  });
  await seedExerciseGoal(db, user.id, {name: 'Tomorrow only', days: [(weekdayIn() + 1) % 7]});
});

test("TP-01/02 today's plan lists only today's goals", async ({authedPage: page}) => {
  const {panel, plan} = await openPlan(page);
  await expect(plan.getByText('0 of 2 done')).toBeVisible();
  await expect(plan.getByRole('link', {name: 'View logs'})).toBeVisible();

  const squats = plan.getByRole('listitem').filter({hasText: 'Squats'});
  await expect(squats).toContainText('3 × 10');
  await expect(squats).toContainText('Chest up');
  await expect(squats.getByRole('button', {name: 'Start Squats'})).toBeVisible();
  await expect(plan.getByRole('listitem').filter({hasText: 'Jog'})).toContainText('20 min');
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

  await logPlanned(panel, 'Squats');
  // The log is shown first so it can be corrected; unchanged it logs the goal.
  const review = card(panel, 'Squats');
  for (const set of [1, 2, 3]) {
    await expect(review.getByLabel(`Set ${set} reps`)).toHaveValue('10');
  }
  await expect(review.getByLabel('Set 4 reps')).toHaveCount(0);
  const request = nextApiRequest(page, '/api/exercise-goals/log');
  await review.getByRole('button', {name: 'Done', exact: true}).click();
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

  await logPlanned(panel, 'Jog');
  await card(panel, 'Jog').getByRole('button', {name: 'Done', exact: true}).click();
  await expect(plan.getByText('All planned exercises done.')).toBeVisible();
  await expect(plan.getByText('2 of 2 done')).toBeVisible();
  await panel.getByRole('button', {name: 'Close'}).click();
  await expect(exerciseProgress(page)).toContainText('2/2');

  await page.goto('/logs?tab=exercise');
  await expect(logRow(page, 'Squats')).toContainText('3 × 10 · Planned');
  await expect(logRow(page, 'Jog')).toContainText('20 min · Planned');
});

test('TP-03 each set can be corrected before it is saved', async ({
  authedPage: page,
  db,
  user,
}) => {
  const {panel, plan} = await openPlan(page);
  await logPlanned(panel, 'Squats');
  const review = card(panel, 'Squats');
  await review.getByLabel('Set 3 reps').fill('8');
  await review.getByLabel('Set 2 weight').fill('20');
  await review.getByLabel('Set 3 weight').fill('25');

  // An extra set starts as a copy of the last.
  await review.getByRole('button', {name: 'Add set'}).click();
  await expect(review.getByLabel('Set 4 reps')).toHaveValue('8');
  await expect(review.getByLabel('Set 4 weight')).toHaveValue('25');
  await review.getByRole('button', {name: 'Remove set 1'}).click();
  await expect(review.getByLabel('Set 1 weight')).toHaveValue('20');

  const request = nextApiRequest(page, '/api/exercise-goals/log');
  await review.getByRole('button', {name: 'Done', exact: true}).click();
  const goal = await db.exerciseGoal.findFirst({where: {userId: user.id, name: 'Squats'}});
  const sets = [
    {reps: 10, weight: 20},
    {reps: 8, weight: 25},
    {reps: 8, weight: 25},
  ];
  expect((await request).postDataJSON()).toEqual({
    goalId: goal!.id,
    exerciseSets: sets,
  });
  await expect(plan.getByText('1 of 2 done')).toBeVisible();
  await expect.poll(() =>
    db.exerciseLog.findFirst({
      where: {exerciseGoalId: goal!.id},
      select: {
        sets: true,
        reps: true,
        weight: true,
        exerciseSets: {orderBy: {position: 'asc'}, select: {reps: true, weight: true}},
      },
    }),
  ).toEqual({sets: 3, reps: 8, weight: 25, exerciseSets: sets});

  await page.goto('/logs?tab=exercise');
  await expect(logRow(page, 'Squats')).toContainText('10 @ 20, 8 @ 25, 8 @ 25 · Planned');
});

test('TP-03 cancelling the review logs nothing', async ({authedPage: page}) => {
  const logs = trackRequests(page, '/api/exercise-goals/log');
  const {panel, plan} = await openPlan(page);
  await logPlanned(panel, 'Jog');
  await card(panel, 'Jog').getByRole('button', {name: 'Cancel without logging'}).click();
  await expect(plan.getByRole('button', {name: 'Start Jog'})).toBeVisible();
  await expect(plan.getByText('0 of 2 done')).toBeVisible();
  expect(logs).toEqual([]);
});

test('TP-09 failed ticks show an error and stay unticked', async ({authedPage: page}) => {
  await page.route('**/api/exercise-goals/log', (route) =>
    route.fulfill({status: 500, json: {error: 'Failed to log planned exercise'}}),
  );
  const {panel, plan} = await openPlan(page);
  await logPlanned(panel, 'Jog');
  await card(panel, 'Jog').getByRole('button', {name: 'Done', exact: true}).click();
  await expect(plan.getByRole('alert')).toHaveText('Failed to log planned exercise');
  await expect(plan.getByText('0 of 2 done')).toBeVisible();
  await expect(plan.getByRole('button', {name: 'Start Jog'})).toBeEnabled();
});

test('TP-09 controls are disabled while a tick is saving', async ({authedPage: page}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/exercise-goals/log', async (route) => {
    await held;
    await route.continue();
  });
  const {panel, plan} = await openPlan(page);
  await logPlanned(panel, 'Jog');
  await card(panel, 'Jog').getByRole('button', {name: 'Done', exact: true}).click();
  await expect(plan.getByRole('button', {name: 'Start Jog'})).toBeDisabled();
  // Other goals stay usable.
  await expect(plan.getByRole('button', {name: 'Start Squats'})).toBeEnabled();
  release();
  await expect(plan.getByText('1 of 2 done')).toBeVisible();
});

test('TP-03 Start offers a workout or just logging it', async ({authedPage: page}) => {
  const {panel, plan} = await openPlan(page);
  // Timed work has a setup screen too, so it can be logged without the timer.
  await plan.getByRole('button', {name: 'Start Jog'}).click();
  const setup = card(panel, 'Jog');
  await expect(setup.getByRole('button', {name: 'Start timer'})).toBeVisible();
  await expect(setup.getByRole('button', {name: 'Just log it'})).toBeVisible();
  await setup.getByRole('button', {name: 'Cancel', exact: true}).first().click();

  await plan.getByRole('button', {name: 'Start Squats'}).click();
  await expect(card(panel, 'Squats').getByRole('button', {name: 'Start 3 sets'})).toBeVisible();
  await card(panel, 'Squats').getByRole('button', {name: 'Just log it'}).click();
  await expect(card(panel, 'Squats').getByText('Check what you did, then log it')).toBeVisible();
});

test('TP-05 undo on a done exercise removes its log', async ({authedPage: page, db, user}) => {
  const {panel, plan} = await openPlan(page);
  await logPlanned(panel, 'Squats');
  await card(panel, 'Squats').getByRole('button', {name: 'Done', exact: true}).click();
  await expect(plan.getByText('1 of 2 done')).toBeVisible();

  // Done exercises are listed on the big screen, each with Undo.
  await panel.getByRole('button', {name: 'Big screen'}).click();
  const done = panel.locator('[data-done-today]');
  const request = nextApiRequest(page, '/api/exercise-goals/log', 'DELETE');
  await done.getByRole('button', {name: 'Undo Squats'}).click();
  expect((await (await request).response())?.status()).toBe(204);
  await expect(done.getByText('Nothing done yet.')).toBeVisible();
  await expect(plan.getByRole('button', {name: 'Start Squats'})).toBeVisible();
  expect(await db.exerciseLog.count({where: {userId: user.id}})).toBe(0);
});
