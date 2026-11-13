import {test, expect} from '../../fixtures/test';
import {seedExerciseGoal} from '../../fixtures/db';
import {weekdayIn} from '../../fixtures/dates';
import {card, openQuickLog} from '../../fixtures/ui';

const today = weekdayIn();
const tomorrow = (today + 1) % 7;

test.beforeEach(() => {
  test.skip(today === 0, 'Sunday has no later day this week');
});

test("DS-01 today's workout can be swapped with tomorrow's and undone", async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {name: 'Easy cardio', days: [today]});
  await seedExerciseGoal(db, user.id, {name: 'Leg day', days: [tomorrow]});
  await page.goto('/dashboard');
  const panel = await openQuickLog(page, 'exercise');
  const plan = card(panel, "Today's plan");
  await expect(plan.getByText('Easy cardio')).toBeVisible();

  await plan.getByRole('button', {name: 'Swap day'}).click();
  await expect(plan.getByLabel('Swap today with')).toContainText('Leg day');
  await plan.getByLabel('Swap today with').selectOption(String(tomorrow));
  await plan.getByRole('button', {name: 'Swap', exact: true}).click();

  await expect(plan.getByText('Leg day')).toBeVisible();
  await expect(plan.getByText('Easy cardio')).toHaveCount(0);
  await expect(plan.getByText(/Doing \w+'s workout today/)).toBeVisible();

  await plan.getByRole('button', {name: 'Undo'}).click();
  await expect(plan.getByText('Easy cardio')).toBeVisible();
  await expect(plan.getByText('Leg day')).toHaveCount(0);
});

test('DS-02 a rest day can take a later workout', async ({authedPage: page, db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Leg day', days: [tomorrow]});
  await page.goto('/dashboard');
  const panel = await openQuickLog(page, 'exercise');

  await panel.getByRole('button', {name: 'Swap day'}).click();
  await panel.getByLabel('Swap today with').selectOption(String(tomorrow));
  await panel.getByRole('button', {name: 'Swap', exact: true}).click();

  const plan = card(panel, "Today's plan");
  await expect(plan.getByText('Leg day')).toBeVisible();
});
