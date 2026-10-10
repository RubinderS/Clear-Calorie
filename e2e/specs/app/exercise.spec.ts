import type {Locator, Page} from '@playwright/test';
import {
  test,
  expect,
  nextApiRequest,
  onNextDialog,
  trackRequests,
} from '../../fixtures/test';
import {seedExerciseGoal, seedSavedExercise} from '../../fixtures/db';
import {calorieSummary, openQuickLog} from '../../fixtures/ui';

function form(scope: Locator) {
  return {
    title: scope.getByRole('heading', {name: 'Add custom exercise'}),
    activity: scope.getByLabel('Activity'),
    strength: scope.getByRole('button', {name: 'Sets & reps'}),
    time: scope.getByRole('button', {name: 'Time based'}),
    sets: scope.getByLabel('Sets', {exact: true}),
    reps: scope.getByLabel('Reps', {exact: true}),
    weight: scope.getByLabel('Weight', {exact: true}),
    duration: scope.getByLabel('Duration (min)'),
    calories: scope.getByLabel('Calories burned'),
    save: scope.getByLabel('Save this item for later'),
    pin: scope.getByLabel('Pin this item'),
    submit: scope.getByRole('button', {name: 'Log exercise'}),
    // Scoped to the form: today's plan above it is also a list.
    suggestions: scope.locator('#exercise-form').getByRole('listitem'),
    alert: scope.getByRole('alert'),
  };
}

async function openExercise(page: Page) {
  await page.goto('/dashboard');
  return openQuickLog(page, 'exercise');
}

test('EX-01/02 no plan: custom form with type toggle', async ({authedPage: page}) => {
  const panel = await openExercise(page);
  const f = form(panel);
  await expect(f.title).toBeVisible();
  await expect(panel.getByRole('link', {name: 'View logs'})).toBeVisible();
  await expect(panel.getByRole('button', {name: 'Log custom exercise'})).toHaveCount(0);

  await expect(f.strength).toHaveAttribute('aria-pressed', 'true');
  await expect(f.sets).toBeVisible();
  await expect(f.reps).toHaveAttribute('max', '100');
  await expect(f.weight).toHaveAttribute('placeholder', 'Optional');
  await expect(f.duration).toHaveCount(0);

  await f.time.click();
  await expect(f.time).toHaveAttribute('aria-pressed', 'true');
  await expect(f.strength).toHaveAttribute('aria-pressed', 'false');
  await expect(f.duration).toBeVisible();
  await expect(f.sets).toHaveCount(0);
});

test('EX-03 log a strength exercise', async ({authedPage: page}) => {
  const f = form(await openExercise(page));
  await f.activity.fill('Bench press');
  await f.sets.fill('5');
  await f.reps.fill('5');
  await f.weight.fill('60');
  await f.calories.fill('150');

  const request = nextApiRequest(page, '/api/exercise');
  await f.submit.click();
  const sent = await request;
  expect(sent.postDataJSON()).toEqual({
    name: 'Bench press',
    calories: 150,
    type: 'STRENGTH',
    sets: 5,
    reps: 5,
    weight: 60,
  });
  expect((await sent.response())?.status()).toBe(201);
  await expect(page.getByRole('dialog', {name: 'Log exercise'})).toBeHidden();
  await expect(calorieSummary(page).burned).toHaveText('150');
});

test('EX-04/05 log a time exercise; blank weight is null', async ({
  authedPage: page,
}) => {
  let f = form(await openExercise(page));
  await f.time.click();
  await f.activity.fill('Rowing');
  await f.duration.fill('25');
  await f.calories.fill('250');
  let request = nextApiRequest(page, '/api/exercise');
  await f.submit.click();
  expect((await request).postDataJSON()).toEqual({
    name: 'Rowing',
    calories: 250,
    type: 'TIME',
    durationMin: 25,
  });

  f = form(await openQuickLog(page, 'exercise'));
  await f.activity.fill('Push-ups');
  await f.sets.fill('3');
  await f.reps.fill('20');
  await f.calories.fill('40');
  request = nextApiRequest(page, '/api/exercise');
  await f.submit.click();
  expect((await request).postDataJSON()).toMatchObject({type: 'STRENGTH', weight: null});
  await expect(calorieSummary(page).burned).toHaveText('290');
});

test('EX-06 browser limits on reps and required fields', async ({authedPage: page}) => {
  const calls = trackRequests(page, '/api/exercise');
  const f = form(await openExercise(page));
  await f.activity.fill('Curls');
  await f.sets.fill('3');
  await f.reps.fill('101');
  await f.calories.fill('50');
  await f.submit.click();
  await expect(f.reps).toHaveJSProperty('validity.rangeOverflow', true);

  await f.reps.fill('10');
  await f.sets.fill('');
  await f.submit.click();
  await expect(f.sets).toHaveJSProperty('validity.valueMissing', true);
  expect(calls).toEqual([]);
});

test("EX-07 custom exercise can't duplicate today's plan", async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {name: 'Squats'});
  const calls = trackRequests(page, '/api/exercise');
  const panel = await openExercise(page);
  await panel.getByRole('button', {name: 'Log custom exercise'}).click();

  const f = form(panel);
  await f.activity.fill('  SQUATS ');
  await f.sets.fill('3');
  await f.reps.fill('10');
  await f.calories.fill('80');
  await f.submit.click();
  await expect(f.alert).toHaveText(`"SQUATS" is in today's plan. Tick it off there instead.`);
  expect(calls).toEqual([]);
});

test.describe('Saved exercises', () => {
  test.beforeEach(async ({db, user}) => {
    await seedSavedExercise(db, user.id, {
      name: 'Morning run',
      type: 'TIME',
      durationMin: 30,
      calories: 320,
      isPinned: true,
    });
    await seedSavedExercise(db, user.id, {
      name: 'Strength training',
      type: 'STRENGTH',
      durationMin: 0,
      sets: 3,
      reps: 10,
      weight: 50,
      calories: 210,
      isPinned: true,
    });
    await seedSavedExercise(db, user.id, {name: 'Hiking', durationMin: 120, calories: 610});
  });

  test('EX-08 suggestions show details and fill the form', async ({authedPage: page}) => {
    const f = form(await openExercise(page));
    await f.activity.focus();
    await expect(f.suggestions).toHaveText([
      /📌 Morning run\s*30 min · 320 kcal/,
      /📌 Strength training\s*3 × 10 @ 50 · 210 kcal/,
    ]);

    await f.suggestions.filter({hasText: 'Strength training'}).click();
    await expect(f.activity).toHaveValue('Strength training');
    await expect(f.strength).toHaveAttribute('aria-pressed', 'true');
    await expect(f.sets).toHaveValue('3');
    await expect(f.reps).toHaveValue('10');
    await expect(f.weight).toHaveValue('50');
    await expect(f.calories).toHaveValue('210');
    await expect(f.save).toBeChecked();
    await expect(f.pin).toBeChecked();

    await f.activity.fill('hik');
    await f.suggestions.filter({hasText: 'Hiking'}).click();
    await expect(f.time).toHaveAttribute('aria-pressed', 'true');
    await expect(f.duration).toHaveValue('120');
    await expect(f.calories).toHaveValue('610');
    await expect(f.pin).not.toBeChecked();
  });

  test("EX-08 saved items in today's plan are not suggested", async ({
    authedPage: page,
    db,
    user,
  }) => {
    await seedExerciseGoal(db, user.id, {name: 'hiking'});
    const panel = await openExercise(page);
    await panel.getByRole('button', {name: 'Log custom exercise'}).click();
    const f = form(panel);
    await f.activity.fill('i');
    await expect(f.suggestions).toHaveText([/Morning run/, /Strength training/]);
  });

  test('EX-09 save a new exercise for later, pinned', async ({authedPage: page, db, user}) => {
    const f = form(await openExercise(page));
    await f.activity.fill('Kettlebell swings');
    await f.sets.fill('4');
    await f.reps.fill('15');
    await f.weight.fill('16');
    await f.calories.fill('120');
    await f.save.check();
    await f.pin.check();

    const saved = nextApiRequest(page, '/api/saved-exercise');
    await f.submit.click();
    expect((await saved).postDataJSON()).toEqual({
      name: 'Kettlebell swings',
      calories: 120,
      type: 'STRENGTH',
      sets: 4,
      reps: 15,
      weight: 16,
      isPinned: true,
    });
    await expect(page.getByRole('dialog', {name: 'Log exercise'})).toBeHidden();
    expect(
      await db.savedExerciseItem.findFirst({where: {userId: user.id, name: 'Kettlebell swings'}}),
    ).toMatchObject({isPinned: true, sets: 4});
  });

  test('EX-09 duplicate saved name is rejected and nothing is logged', async ({
    authedPage: page,
  }) => {
    const logs = trackRequests(page, '/api/exercise');
    const f = form(await openExercise(page));
    await f.time.click();
    await f.activity.fill('Hiking');
    await f.duration.fill('60');
    await f.calories.fill('300');
    await f.save.check();
    await f.submit.click();
    await expect(f.alert).toHaveText('An item with this name already exists');
    expect(logs).toEqual([]);
  });

  test('EX-09 removing a saved exercise', async ({authedPage: page, db, user}) => {
    const f = form(await openExercise(page));
    await f.activity.fill('hik');
    const message = onNextDialog(page, 'accept');
    const request = nextApiRequest(page, '/api/saved-exercise', 'DELETE');
    await f.suggestions.getByRole('button', {name: 'Remove Hiking'}).click();
    expect(await message).toBe(
      'Delete saved exercise "Hiking"? This cannot be undone. Existing exercise logs will not be affected.',
    );
    await request;
    await expect(f.suggestions).toHaveCount(0);
    expect(await db.savedExerciseItem.count({where: {userId: user.id, name: 'Hiking'}})).toBe(0);
  });
});

test('EX-10 server errors are shown', async ({authedPage: page}) => {
  await page.route('**/api/exercise', (route) =>
    route.fulfill({status: 500, json: {error: 'Failed to log exercise'}}),
  );
  const panel = await openExercise(page);
  const f = form(panel);
  await f.time.click();
  await f.activity.fill('Swim');
  await f.duration.fill('20');
  await f.calories.fill('200');
  await f.submit.click();
  await expect(f.alert).toHaveText('Failed to log exercise');
  await expect(panel).toBeVisible();
});
