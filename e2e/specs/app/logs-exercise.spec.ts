import {test, expect, nextApiRequest, onNextDialog} from '../../fixtures/test';
import {seedExercise, seedExerciseGoal} from '../../fixtures/db';
import {daysAgoIn, longDate, noonDaysAgo, todayIn} from '../../fixtures/dates';
import {card, dialog, exerciseProgress, fillSets, logRow, setMode} from '../../fixtures/ui';

const STRENGTH = {
  name: 'Bench press',
  type: 'STRENGTH',
  durationMin: 0,
  sets: 3,
  reps: 10,
  weight: 50,
  calories: 210,
};

test('EL-01 list shows details, totals and planned entries', async ({
  authedPage: page,
  db,
  user,
}) => {
  const goal = await seedExerciseGoal(db, user.id, {name: 'Plank', type: 'TIME', durationMin: 5});
  await seedExercise(db, user.id, STRENGTH);
  await seedExercise(db, user.id, {name: 'Run', durationMin: 30, calories: 300});
  await seedExercise(db, user.id, {
    name: 'Plank',
    durationMin: 5,
    calories: 20,
    exerciseGoalId: goal.id,
    goalDate: todayIn(),
  });
  await page.goto('/logs?tab=exercise');

  const list = card(page, "Today's workouts");
  await expect(list.getByText('530 calories burned')).toBeVisible();
  await expect(logRow(page, 'Bench press')).toContainText('3 × 10 @ 50');
  await expect(logRow(page, 'Bench press')).toContainText('210 kcal');
  await expect(logRow(page, 'Run')).toContainText('30 min');
  await expect(logRow(page, 'Run')).not.toContainText('Planned');
  await expect(logRow(page, 'Plank')).toContainText('5 min · Planned');
});

test('EL-02 past days are fetched and read-only', async ({authedPage: page, db, user}) => {
  await seedExercise(db, user.id, {name: 'Old swim', loggedAt: noonDaysAgo(2)});
  await page.goto('/logs?tab=exercise');
  await expect(page.getByText('No exercise logged today.')).toBeVisible();

  const fetched = page.waitForRequest(`**/api/exercise?date=${daysAgoIn(2)}`);
  await page.getByLabel('View exercise logs for date').fill(daysAgoIn(2));
  await fetched;
  await expect(page.getByRole('heading', {name: longDate(daysAgoIn(2))})).toBeVisible();
  await expect(logRow(page, 'Old swim').getByRole('button', {name: 'Edit Old swim'})).toBeDisabled();
  await expect(
    logRow(page, 'Old swim').getByRole('button', {name: 'Delete Old swim'}),
  ).toBeDisabled();

  await page.getByRole('button', {name: 'Previous day'}).click();
  await expect(page.getByText('No exercise logged on this date.')).toBeVisible();
});

test.describe('EL-03 editing what was done', () => {
  test('strength calories scale with volume and weight', async ({
    authedPage: page,
    db,
    user,
  }) => {
    const entry = await seedExercise(db, user.id, STRENGTH);
    await page.goto('/logs?tab=exercise');
    await logRow(page, 'Bench press').getByRole('button', {name: 'Edit Bench press'}).click();

    const edit = dialog(page, 'Edit exercise');
    await expect(edit.getByRole('heading', {name: 'Bench press'})).toBeVisible();
    await expect(edit.getByText('Log what you actually did')).toBeVisible();
    await expect(edit.getByRole('group', {name: 'Exercise type'})).toHaveCount(0);
    // Not a planned entry, so no goal notes.
    await expect(edit.getByRole('heading', {name: 'Notes'})).toHaveCount(0);

    // Entries logged before sets were kept get one row per set.
    const calories = edit.getByLabel('Calories burned');
    await expect(calories).toHaveValue('210');
    await expect(edit.getByLabel('Set 3 reps')).toHaveValue('10');
    await expect(edit.getByLabel('Set 3 weight')).toHaveValue('50');
    await expect(edit.getByRole('button', {name: 'Remove set 1'})).toBeEnabled();

    // A pyramid: heavier each set.
    await edit.getByLabel('Set 2 weight').fill('60');
    await edit.getByLabel('Set 3 weight').fill('70');
    await expect(calories).toHaveValue('252');
    await edit.getByLabel('Set 3 reps').fill('5');
    await expect(calories).toHaveValue('203');

    // Once set by hand, calories stop following the sets.
    await calories.fill('200');
    await edit.getByLabel('Set 1 reps').fill('12');
    await expect(calories).toHaveValue('200');

    const request = nextApiRequest(page, '/api/exercise', 'PATCH');
    await edit.getByRole('button', {name: 'Save changes'}).click();
    expect((await request).postDataJSON()).toEqual({
      id: entry.id,
      calories: 200,
      exerciseSets: [
        {reps: 12, weight: 50},
        {reps: 10, weight: 60},
        {reps: 5, weight: 70},
      ],
    });
    await expect(edit).toBeHidden();
    await expect(logRow(page, 'Bench press')).toContainText('12 @ 50, 10 @ 60, 5 @ 70');
    await expect(logRow(page, 'Bench press')).toContainText('200 kcal');

    // Reopening shows the sets as saved; one set can't be removed.
    await logRow(page, 'Bench press').getByRole('button', {name: 'Edit Bench press'}).click();
    await expect(edit.getByLabel('Set 2 weight')).toHaveValue('60');
    await edit.getByRole('button', {name: 'Remove set 3'}).click();
    await edit.getByRole('button', {name: 'Remove set 2'}).click();
    await expect(edit.getByRole('button', {name: 'Remove set 1'})).toBeDisabled();
    await edit.getByRole('button', {name: 'Save changes'}).click();
    await expect(logRow(page, 'Bench press')).toContainText('1 × 12 @ 50');
  });

  test('time calories scale with duration', async ({authedPage: page, db, user}) => {
    await seedExercise(db, user.id, {name: 'Cycling', durationMin: 30, calories: 300});
    await page.goto('/logs?tab=exercise');
    await logRow(page, 'Cycling').getByRole('button', {name: 'Edit Cycling'}).click();
    const edit = dialog(page, 'Edit exercise');
    // Entries logged before sets were kept get one timed set.
    await expect(edit.getByLabel('Set 1 time')).toHaveValue('30:00');
    await edit.getByLabel('Set 1 time').fill('15');
    await expect(edit.getByLabel('Calories burned')).toHaveValue('150');
    await edit.getByRole('button', {name: 'Save changes'}).click();
    await expect(logRow(page, 'Cycling')).toContainText('15 min');
    await expect(page.getByText('150 calories burned')).toBeVisible();
  });

  test('a set can change from reps to time', async ({authedPage: page, db, user}) => {
    const entry = await seedExercise(db, user.id, {...STRENGTH, name: 'Plank'});
    await page.goto('/logs?tab=exercise');
    await logRow(page, 'Plank').getByRole('button', {name: 'Edit Plank'}).click();
    const edit = dialog(page, 'Edit exercise');
    await setMode(edit, 3, 'time').check();
    await edit.getByLabel('Set 3 time').fill('1:15');

    const request = nextApiRequest(page, '/api/exercise', 'PATCH');
    await edit.getByRole('button', {name: 'Save changes'}).click();
    expect((await request).postDataJSON()).toMatchObject({
      id: entry.id,
      exerciseSets: [
        {reps: 10, weight: 50},
        {reps: 10, weight: 50},
        {durationSec: 75, weight: 50},
      ],
    });
    await expect(logRow(page, 'Plank')).toContainText('10 @ 50, 10 @ 50, 1:15 @ 50');
  });

  test('EL-06 server errors are shown in the dialog', async ({authedPage: page, db, user}) => {
    await seedExercise(db, user.id, {name: 'Yoga'});
    await page.route('**/api/exercise', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({status: 400, json: {error: 'Exercise type cannot be changed'}})
        : route.continue(),
    );
    await page.goto('/logs?tab=exercise');
    await logRow(page, 'Yoga').getByRole('button', {name: 'Edit Yoga'}).click();
    const edit = dialog(page, 'Edit exercise');
    await edit.getByRole('button', {name: 'Save changes'}).click();
    await expect(edit.getByRole('alert')).toHaveText('Exercise type cannot be changed');
  });
});

test('EL-04 planned entries edit the goal notes', async ({authedPage: page, db, user}) => {
  const goal = await seedExerciseGoal(db, user.id, {name: 'Lunges'});
  await seedExercise(db, user.id, {
    name: 'Lunges',
    type: 'STRENGTH',
    sets: 3,
    reps: 10,
    exerciseGoalId: goal.id,
    goalDate: todayIn(),
  });
  await page.goto('/logs?tab=exercise');
  await logRow(page, 'Lunges').getByRole('button', {name: 'Edit Lunges'}).click();

  const edit = dialog(page, 'Edit exercise');
  await expect(edit.getByText('No notes yet.')).toBeVisible();
  await edit.getByRole('button', {name: 'Add', exact: true}).click();
  await edit.getByLabel('Notes').fill('Knee over ankle');

  const request = nextApiRequest(page, '/api/exercise-goals', 'PATCH');
  await edit.getByRole('button', {name: 'Save', exact: true}).click();
  const sent = await request;
  expect(sent.postDataJSON()).toEqual({id: goal.id, notes: 'Knee over ankle'});
  expect((await sent.response())?.status()).toBe(204);
  await expect(edit.getByText('Knee over ankle')).toBeVisible();
  await expect(edit.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();

  await edit.getByRole('button', {name: 'Close'}).click();
  await logRow(page, 'Lunges').getByRole('button', {name: 'Edit Lunges'}).click();
  await expect(dialog(page, 'Edit exercise').getByText('Knee over ankle')).toBeVisible();
  expect((await db.exerciseGoal.findUnique({where: {id: goal.id}}))?.notes).toBe(
    'Knee over ankle',
  );
});

test('EL-05 deleting a planned entry unticks it', async ({authedPage: page, db, user}) => {
  const goal = await seedExerciseGoal(db, user.id, {name: 'Burpees'});
  await seedExercise(db, user.id, {
    name: 'Burpees',
    exerciseGoalId: goal.id,
    goalDate: todayIn(),
  });
  await page.goto('/dashboard');
  await expect(exerciseProgress(page)).toHaveAttribute('aria-valuenow', '1');

  await page.goto('/logs?tab=exercise');
  const message = onNextDialog(page, 'accept');
  const request = nextApiRequest(page, '/api/exercise', 'DELETE');
  await logRow(page, 'Burpees').getByRole('button', {name: 'Delete Burpees'}).click();
  expect(await message).toBe('Delete Burpees? This cannot be undone.');
  expect((await (await request).response())?.status()).toBe(204);
  await expect(page.getByText('No exercise logged today.')).toBeVisible();

  await page.goto('/dashboard');
  await expect(exerciseProgress(page)).toHaveAttribute('aria-valuenow', '0');
  await expect(exerciseProgress(page)).toHaveAttribute('aria-valuemax', '1');
});

test('EL-07 the plus button ticks the plan and logs custom exercise', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {
    name: 'Plank',
    type: 'TIME',
    durationMin: 5,
    sets: null,
    reps: null,
  });
  await page.goto('/logs?tab=exercise');

  await card(page, "Today's workouts").getByRole('button', {name: 'Add exercise'}).click();
  const panel = dialog(page, 'Log exercise');
  await expect(panel.getByRole('link', {name: 'View logs'})).toHaveCount(0);
  await panel.getByRole('checkbox', {name: 'Mark Plank as done'}).click();
  await card(panel, 'Plank').getByRole('button', {name: 'Done', exact: true}).click();
  await expect(panel.getByText('All planned exercises done.')).toBeVisible();
  // The list behind the dialog picks up the ticked goal straight away.
  await expect(logRow(page, 'Plank')).toContainText('Planned');

  await panel.getByRole('button', {name: 'Log custom exercise'}).click();
  await panel.getByLabel('Activity').fill('Run');
  await fillSets(panel, ['30']);
  await panel.getByLabel('Calories burned').fill('300');
  await panel.getByRole('button', {name: 'Log exercise'}).click();
  await expect(panel).toBeHidden();
  await expect(logRow(page, 'Run')).toContainText('300 kcal');
});
