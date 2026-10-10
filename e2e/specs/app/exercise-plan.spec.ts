import type {Page} from '@playwright/test';
import {test, expect, nextApiRequest, onNextDialog, trackRequests} from '../../fixtures/test';
import {seedExerciseGoal} from '../../fixtures/db';
import {dialog} from '../../fixtures/ui';
import {WEEKDAYS} from '../../../lib/exercise';

const daySection = (page: Page, day: number) => page.locator(`#exerciseGoalsDay-${day}`);
const dayToggle = (page: Page, name: string) =>
  page.getByRole('button', {name: new RegExp(`^${name}`)});

async function openAdd(page: Page) {
  await page.goto('/exercise-plan');
  await page.getByRole('button', {name: 'Add exercise'}).click();
  return dialog(page, 'Add exercise');
}

function goalForm(scope: ReturnType<typeof dialog>) {
  return {
    name: scope.getByLabel('Exercise', {exact: true}),
    time: scope.getByRole('button', {name: 'Time based'}),
    sets: scope.getByLabel('Sets', {exact: true}),
    reps: scope.getByLabel('Reps', {exact: true}),
    weight: scope.getByLabel('Weight', {exact: true}),
    duration: scope.getByLabel('Duration (min)'),
    calories: scope.getByLabel('Calories burned'),
    notes: scope.getByLabel('Notes'),
    everyDay: scope.getByLabel('Every day'),
    day: (label: string) => scope.getByLabel(label, {exact: true}),
    cancel: scope.getByRole('button', {name: 'Cancel'}),
    alert: scope.getByRole('alert'),
  };
}

test('EP-01 empty plan', async ({authedPage: page}) => {
  await page.goto('/exercise-plan');
  await expect(page.getByText('Plan the exercises you want to do each day')).toBeVisible();
  await expect(page.getByText('No exercise plan yet.')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Collapse all'})).toHaveCount(0);

  const add = await openAdd(page);
  await expect(add.getByRole('heading', {name: 'Add exercise'})).toBeVisible();
  await expect(add.getByText('Choose the exercise and the days you plan to do it.')).toBeVisible();
  await expect(goalForm(add).name).toHaveAttribute('maxlength', '100');
  await expect(goalForm(add).notes).toHaveAttribute('maxlength', '500');
  // AI is off on this server.
  await expect(add.getByRole('button', {name: 'Estimate calories burned with AI'})).toHaveCount(0);
});

test('EP-02 add a strength goal on Mon/Wed/Fri', async ({authedPage: page, db, user}) => {
  const add = await openAdd(page);
  const f = goalForm(add);
  await f.name.fill('Goblet squats');
  await f.sets.fill('3');
  await f.reps.fill('10');
  await f.weight.fill('50');
  await f.calories.fill('200');
  await f.notes.fill('Heels down');
  await f.day('Mon').check();
  await f.day('Wed').check();
  await f.day('Fri').check();

  const request = nextApiRequest(page, '/api/exercise-goals');
  await add.getByRole('button', {name: 'Add exercise'}).click();
  const sent = await request;
  expect(sent.postDataJSON()).toEqual({
    name: 'Goblet squats',
    calories: 200,
    notes: 'Heels down',
    days: [1, 3, 5],
    type: 'STRENGTH',
    sets: 3,
    reps: 10,
    weight: 50,
  });
  expect((await sent.response())?.status()).toBe(201);
  await expect(add).toBeHidden();

  for (const day of [1, 3, 5]) {
    const section = daySection(page, day);
    await expect(section).toContainText('Goblet squats');
    await expect(section).toContainText('3 × 10 @ 50 · 200 kcal');
    await expect(section).toContainText('Heels down');
  }
  for (const day of [2, 4, 6, 0]) {
    await expect(daySection(page, day)).toHaveText('Rest day');
  }
  expect(await db.exerciseGoal.count({where: {userId: user.id}})).toBe(1);
});

test('EP-03 time goal without calories', async ({authedPage: page}) => {
  const add = await openAdd(page);
  const f = goalForm(add);
  await f.name.fill('Evening walk');
  await f.time.click();
  await f.duration.fill('20');
  await f.day('Sun').check();

  const request = nextApiRequest(page, '/api/exercise-goals');
  await add.getByRole('button', {name: 'Add exercise'}).click();
  expect((await request).postDataJSON()).toEqual({
    name: 'Evening walk',
    calories: 0,
    notes: '',
    days: [0],
    type: 'TIME',
    durationMin: 20,
  });
  const sunday = daySection(page, 0);
  await expect(sunday).toContainText('20 min');
  await expect(sunday).not.toContainText('kcal');
});

test('EP-04 at least one day is required', async ({authedPage: page}) => {
  const calls = trackRequests(page, '/api/exercise-goals');
  const add = await openAdd(page);
  const f = goalForm(add);
  await f.name.fill('Plank');
  await f.time.click();
  await f.duration.fill('2');
  await add.getByRole('button', {name: 'Add exercise'}).click();
  await expect(f.alert).toHaveText('Select at least one day.');
  expect(calls).toEqual([]);
});

test('EP-05 "Every day" selects all days and shows partial selection', async ({
  authedPage: page,
}) => {
  const f = goalForm(await openAdd(page));
  await f.everyDay.check();
  for (const {label} of WEEKDAYS) await expect(f.day(label)).toBeChecked();

  await f.day('Sun').uncheck();
  await expect(f.everyDay).not.toBeChecked();
  await expect(f.everyDay).toHaveJSProperty('indeterminate', true);

  await f.everyDay.check();
  await expect(f.day('Sun')).toBeChecked();
  await f.everyDay.uncheck();
  for (const {label} of WEEKDAYS) await expect(f.day(label)).not.toBeChecked();
  await expect(f.everyDay).toHaveJSProperty('indeterminate', false);
});

test('EP-07 edit a goal', async ({authedPage: page, db, user}) => {
  const goal = await seedExerciseGoal(db, user.id, {
    name: 'Rows',
    sets: 3,
    reps: 8,
    weight: 20,
    calories: 150,
    notes: 'Squeeze',
    days: [2, 4],
  });
  await page.goto('/exercise-plan');
  await daySection(page, 2).getByRole('button', {name: 'Edit Rows'}).click();

  const edit = dialog(page, 'Edit exercise');
  const f = goalForm(edit);
  await expect(edit.getByRole('heading', {name: 'Edit exercise'})).toBeVisible();
  await expect(f.name).toHaveValue('Rows');
  await expect(f.sets).toHaveValue('3');
  await expect(f.reps).toHaveValue('8');
  await expect(f.weight).toHaveValue('20');
  await expect(f.calories).toHaveValue('150');
  await expect(f.notes).toHaveValue('Squeeze');
  await expect(f.day('Tue')).toBeChecked();
  await expect(f.day('Thu')).toBeChecked();
  await expect(f.day('Mon')).not.toBeChecked();

  await f.name.fill('Cable rows');
  await f.reps.fill('12');
  await f.day('Thu').uncheck();
  await f.day('Sat').check();

  const request = nextApiRequest(page, '/api/exercise-goals');
  await edit.getByRole('button', {name: 'Update exercise'}).click();
  const sent = await request;
  expect(sent.postDataJSON()).toMatchObject({
    id: goal.id,
    name: 'Cable rows',
    reps: 12,
    days: [2, 6],
  });
  expect((await sent.response())?.status()).toBe(200);
  await expect(edit).toBeHidden();
  await expect(daySection(page, 6)).toContainText('Cable rows');
  await expect(daySection(page, 4)).toHaveText('Rest day');
});

test('EP-08 cancel, close and Escape reset the form', async ({authedPage: page}) => {
  for (const close of ['cancel', 'close', 'escape'] as const) {
    const add = await openAdd(page);
    const f = goalForm(add);
    await f.name.fill('Draft');
    await f.day('Mon').check();
    if (close === 'cancel') await f.cancel.click();
    if (close === 'close') await add.getByRole('button', {name: 'Close'}).click();
    if (close === 'escape') await page.keyboard.press('Escape');
    await expect(add).toBeHidden();

    await page.getByRole('button', {name: 'Add exercise'}).click();
    await expect(goalForm(dialog(page, 'Add exercise')).name).toHaveValue('');
    await expect(goalForm(dialog(page, 'Add exercise')).day('Mon')).not.toBeChecked();
    await page.keyboard.press('Escape');
  }
});

test('EP-09 delete asks first, wording depends on days', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {name: 'Multi', days: [1, 2]});
  await seedExerciseGoal(db, user.id, {name: 'Single', days: [3]});
  await page.goto('/exercise-plan');

  const dismissed = onNextDialog(page, 'dismiss');
  await daySection(page, 1).getByRole('button', {name: 'Delete Multi'}).click();
  expect(await dismissed).toBe('Delete "Multi" from all its days?');
  await expect(daySection(page, 2)).toContainText('Multi');

  void onNextDialog(page, 'accept');
  const request = nextApiRequest(page, '/api/exercise-goals', 'DELETE');
  await daySection(page, 1).getByRole('button', {name: 'Delete Multi'}).click();
  expect((await (await request).response())?.status()).toBe(204);
  await expect(daySection(page, 1)).toHaveText('Rest day');
  await expect(daySection(page, 2)).toHaveText('Rest day');

  const single = onNextDialog(page, 'accept');
  await daySection(page, 3).getByRole('button', {name: 'Delete Single'}).click();
  expect(await single).toBe('Delete "Single"?');
  await expect(page.getByText('No exercise plan yet.')).toBeVisible();
});

test('EP-10/11 days are ordered Monday first and collapse', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {name: 'One', days: [1]});
  await seedExerciseGoal(db, user.id, {name: 'Two', days: [1, 3]});
  await page.goto('/exercise-plan');

  const toggles = page.locator('section h3 button');
  await expect(toggles).toHaveText(WEEKDAYS.map(({name}) => name));

  const monday = dayToggle(page, 'Monday');
  await expect(monday).toHaveAttribute('aria-expanded', 'true');
  await monday.click();
  await expect(monday).toHaveAttribute('aria-expanded', 'false');
  await expect(monday).toContainText('2 exercises');
  await expect(daySection(page, 1)).toBeHidden();

  await dayToggle(page, 'Wednesday').click();
  await expect(dayToggle(page, 'Wednesday')).toContainText('1 exercise');
  await dayToggle(page, 'Tuesday').click();
  await expect(dayToggle(page, 'Tuesday')).toContainText('Rest day');

  await page.getByRole('button', {name: 'Collapse all'}).click();
  for (const {name} of WEEKDAYS) {
    await expect(dayToggle(page, name)).toHaveAttribute('aria-expanded', 'false');
  }
  await page.getByRole('button', {name: 'Expand all'}).click();
  for (const {name} of WEEKDAYS) {
    await expect(dayToggle(page, name)).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(page.getByRole('button', {name: 'Collapse all'})).toBeVisible();
});
