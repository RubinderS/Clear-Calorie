import type {Page} from '@playwright/test';
import {test, expect, nextApiRequest, onNextDialog, trackRequests} from '../../fixtures/test';
import {seedExerciseGoal} from '../../fixtures/db';
import {dialog, fillSets, repeat} from '../../fixtures/ui';
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
    fillSets: (sets: Parameters<typeof fillSets>[1], weight?: number) =>
      fillSets(scope, sets, weight),
    setReps: (n: number) => scope.getByLabel(`Set ${n} reps`),
    setTime: (n: number) => scope.getByLabel(`Set ${n} time`),
    setWeight: (n: number) => scope.getByLabel(`Set ${n} weight`),
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

test('EP-12 a built-in exercise is suggested, linked and has a how-to', async ({
  authedPage: page,
  db,
  user,
}) => {
  const add = await openAdd(page);
  const f = goalForm(add);
  await f.name.fill('push');
  const suggestions = add.getByRole('list', {name: 'Built-in exercises'});
  await expect(suggestions).toContainText('Push-up');
  await expect(suggestions).toContainText('Chest');
  await suggestions.getByRole('listitem').filter({hasText: /^Push-up/}).click();
  await expect(f.name).toHaveValue('Push-up');
  await expect(suggestions).toBeHidden();
  await f.fillSets(repeat(12, 3));
  await f.day('Mon').check();
  await add.getByRole('button', {name: 'Add exercise'}).click();
  await expect(add).toBeHidden();

  const goal = await db.exerciseGoal.findFirstOrThrow({where: {userId: user.id}});
  expect(goal).toMatchObject({name: 'Push-up', catalogId: 'push-up'});

  // The schedule shows its main area beside the name.
  await expect(daySection(page, 1).getByTitle('Main area worked')).toHaveText('Chest');
  await daySection(page, 1).getByRole('button', {name: 'How to do Push-up'}).click();
  const howTo = dialog(page, 'How to do Push-up');
  await expect(howTo.getByRole('img', {name: 'Push-up'})).toBeVisible();
  await expect(howTo.getByRole('group', {name: 'Areas worked'})).toHaveText(
    'Works Chest · also Triceps, Shoulders, Core',
  );
  // Tips and mistakes start collapsed; tapping a title opens it.
  const tips = howTo.getByRole('list', {name: 'Form tips'});
  await expect(tips).toBeHidden();
  await expect(howTo.getByRole('list', {name: 'Common mistakes'})).toBeHidden();
  await howTo.getByText('Form tips').click();
  await expect(tips).toContainText('Lower until your chest is just above the floor');
  // The rep's phases, as steps in order.
  await expect(howTo.getByRole('list', {name: 'Steps'})).toHaveText(
    /Lower.*Chest just above the floor.*Push the floor away.*Straight line, heels to head/,
  );
  // Plays on its own, with its own controls.
  await howTo.getByRole('button', {name: 'Pause animation'}).click();
  await expect(howTo.getByRole('button', {name: 'Play animation'})).toBeVisible();
});

test('EP-14 the add dialog shows how to do a built-in exercise', async ({authedPage: page}) => {
  const add = await openAdd(page);
  const f = goalForm(add);
  const howTo = add.getByRole('button', {name: 'How to do Push-up'});
  await expect(howTo).toHaveCount(0);
  await f.name.fill('push');
  await add
    .getByRole('list', {name: 'Built-in exercises'})
    .getByRole('listitem')
    .filter({hasText: /^Push-up/})
    .click();
  await expect(howTo).toBeVisible();
  // The areas it works, in the same words as the how-to.
  await expect(add.getByRole('group', {name: 'Areas worked'})).toHaveText(
    'Works Chest · also Triceps, Shoulders, Core',
  );

  // Closing the how-to, by button or Escape, leaves the form as it was.
  await howTo.click();
  const guide = dialog(page, 'How to do Push-up');
  await expect(guide.getByRole('img', {name: 'Push-up'})).toBeVisible();
  await guide.getByRole('button', {name: 'Close'}).click();
  await expect(guide).toBeHidden();
  await expect(add).toBeVisible();
  await howTo.click();
  await expect(guide).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(add).toBeVisible();
  await expect(f.name).toHaveValue('Push-up');

  // A name that isn't built-in has none.
  await f.name.fill('Sandbag carries');
  await expect(add.getByRole('button', {name: /^How to do/})).toHaveCount(0);
  await expect(add.getByRole('group', {name: 'Areas worked'})).toHaveCount(0);
});

test('EP-13 own exercises stay unlinked, with no how-to', async ({authedPage: page, db, user}) => {
  const add = await openAdd(page);
  const f = goalForm(add);
  await f.name.fill('Sandbag carries');
  await expect(add.getByRole('list', {name: 'Built-in exercises'})).toHaveCount(0);
  await f.fillSets(repeat(10, 3));
  await f.day('Tue').check();
  await add.getByRole('button', {name: 'Add exercise'}).click();
  await expect(add).toBeHidden();

  expect((await db.exerciseGoal.findFirstOrThrow({where: {userId: user.id}})).catalogId).toBeNull();
  await expect(daySection(page, 2)).toContainText('Sandbag carries');
  await expect(page.getByRole('button', {name: /^How to do/})).toHaveCount(0);
});

test('EP-02 add a strength goal on Mon/Wed/Fri', async ({authedPage: page, db, user}) => {
  const add = await openAdd(page);
  const f = goalForm(add);
  await f.name.fill('Kettlebell swings');
  await f.fillSets(repeat(10, 3), 50);
  await f.calories.fill('200');
  await f.notes.fill('Heels down');
  await f.day('Mon').check();
  await f.day('Wed').check();
  await f.day('Fri').check();

  const request = nextApiRequest(page, '/api/exercise-goals');
  await add.getByRole('button', {name: 'Add exercise'}).click();
  const sent = await request;
  expect(sent.postDataJSON()).toEqual({
    name: 'Kettlebell swings',
    calories: 200,
    notes: 'Heels down',
    days: [1, 3, 5],
    exerciseSets: repeat(10, 3).map((reps) => ({reps, weight: 50})),
  });
  expect((await sent.response())?.status()).toBe(201);
  await expect(add).toBeHidden();

  for (const day of [1, 3, 5]) {
    const section = daySection(page, day);
    await expect(section).toContainText('Kettlebell swings');
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
  await f.fillSets(['20']);
  await f.day('Sun').check();

  const request = nextApiRequest(page, '/api/exercise-goals');
  await add.getByRole('button', {name: 'Add exercise'}).click();
  expect((await request).postDataJSON()).toEqual({
    name: 'Evening walk',
    calories: 0,
    notes: '',
    days: [0],
    exerciseSets: [{durationSec: 1200, weight: null}],
  });
  const sunday = daySection(page, 0);
  await expect(sunday).toContainText('20 min');
  await expect(sunday).not.toContainText('kcal');
});

test('EP-03b sets can mix reps and time, each with its own weight', async ({
  authedPage: page,
  db,
  user,
}) => {
  const add = await openAdd(page);
  const f = goalForm(add);
  await f.name.fill('Farmer carry');
  await f.fillSets([10]);
  await f.setWeight(1).fill('20');
  // An added set starts as a copy of the last, weight included.
  await add.getByRole('button', {name: 'Add set'}).click();
  await expect(f.setReps(2)).toHaveValue('10');
  await expect(f.setWeight(2)).toHaveValue('20');
  await f.fillSets([10, 10, '0:45']);
  await f.setWeight(2).fill('25');
  await f.setWeight(3).fill('30');
  await f.day('Mon').check();

  const request = nextApiRequest(page, '/api/exercise-goals');
  await add.getByRole('button', {name: 'Add exercise'}).click();
  expect((await request).postDataJSON()).toMatchObject({
    exerciseSets: [
      {reps: 10, weight: 20},
      {reps: 10, weight: 25},
      {durationSec: 45, weight: 30},
    ],
  });
  await expect(daySection(page, 1)).toContainText('10 @ 20, 10 @ 25, 45s @ 30');
  expect(
    await db.exerciseGoal.findFirst({where: {userId: user.id, name: 'Farmer carry'}}),
  ).toMatchObject({type: 'STRENGTH', sets: 3, reps: 10, weight: 25, durationMin: 1});

  await daySection(page, 1).getByRole('button', {name: 'Edit Farmer carry'}).click();
  const edit = goalForm(dialog(page, 'Edit exercise'));
  await expect(edit.setTime(3)).toHaveValue('0:45');
  await expect(edit.setWeight(2)).toHaveValue('25');
});

test('EP-04 at least one day is required', async ({authedPage: page}) => {
  const calls = trackRequests(page, '/api/exercise-goals');
  const add = await openAdd(page);
  const f = goalForm(add);
  await f.name.fill('Plank');
  await f.fillSets(['2']);
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
  for (const n of [1, 2, 3]) await expect(f.setReps(n)).toHaveValue('8');
  for (const n of [1, 2, 3]) await expect(f.setWeight(n)).toHaveValue('20');
  await expect(f.calories).toHaveValue('150');
  await expect(f.notes).toHaveValue('Squeeze');
  await expect(f.day('Tue')).toBeChecked();
  await expect(f.day('Thu')).toBeChecked();
  await expect(f.day('Mon')).not.toBeChecked();

  await f.name.fill('Cable rows');
  await f.fillSets(repeat(12, 3));
  await f.day('Thu').uncheck();
  await f.day('Sat').check();

  const request = nextApiRequest(page, '/api/exercise-goals');
  await edit.getByRole('button', {name: 'Update exercise'}).click();
  const sent = await request;
  expect(sent.postDataJSON()).toMatchObject({
    id: goal.id,
    name: 'Cable rows',
    exerciseSets: repeat(12, 3).map((reps) => ({reps, weight: 20})),
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
  const counts: Record<string, string> = {Monday: '2 exercises', Wednesday: '1 exercise'};
  await expect(toggles).toHaveText(WEEKDAYS.map(({name}) => name + (counts[name] ?? '')));

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
