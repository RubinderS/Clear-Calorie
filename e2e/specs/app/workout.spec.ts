import type {Locator, Page} from '@playwright/test';
import {test, expect, nextApiRequest, trackRequests} from '../../fixtures/test';
import {daysAgoIn, noonDaysAgo} from '../../fixtures/dates';
import {seedExercise, seedExerciseGoal} from '../../fixtures/db';
import {card, openQuickLog} from '../../fixtures/ui';

/** Opens the dashboard exercise dialog and starts the named planned goal. */
async function startGoal(page: Page, name: string) {
  await page.goto('/dashboard');
  const panel = await openQuickLog(page, 'exercise');
  await panel.getByRole('button', {name: `Start ${name}`}).click();
  const workout = card(panel, name);
  await expect(workout.getByText('Workout in progress')).toBeVisible();
  return {panel, workout};
}

/** Freezes the page clock so the timer only moves when the test says so. */
async function freezeClock(page: Page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
}

function controls(workout: Locator) {
  return {
    timer: workout.getByRole('timer'),
    step: workout.locator('[aria-live="polite"] p').first(),
    detail: workout.locator('[aria-live="polite"] p').nth(1),
    voice: workout.getByRole('radio', {name: 'Voice'}),
    tones: workout.getByRole('radio', {name: 'Tones'}),
    cuesOff: workout.getByRole('radio', {name: 'Off'}),
    music: workout.getByRole('button', {name: /^Music (on|off)$/}),
    tempo: workout.getByText(/ s \/ rep$/),
    reps: workout.getByText(/^\d+ reps$/),
    slower: workout.getByRole('button', {name: 'Increase tempo'}),
    faster: workout.getByRole('button', {name: 'Decrease tempo'}),
    moreReps: workout.getByRole('button', {name: 'Increase reps'}),
    fewerReps: workout.getByRole('button', {name: 'Decrease reps'}),
    pause: workout.getByRole('button', {name: /^(Pause|Resume)$/}),
    next: workout.getByRole('button', {name: /^(Done|Skip rest|Finish)$/}),
  };
}

test('WO-01 strength setup screen', async ({authedPage: page, db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Squats', sets: 3, reps: 12, weight: 40, tempoMs: 2000});
  const {panel, workout} = await startGoal(page, 'Squats');
  const c = controls(workout);

  await expect(workout.getByRole('radiogroup', {name: 'Cues'})).toBeVisible();
  await expect(c.voice).toBeChecked();
  await expect(c.tones).not.toBeChecked();
  await expect(c.cuesOff).not.toBeChecked();
  await expect(c.music).toHaveText('Music off');
  await expect(c.tempo).toHaveText('2 s / rep');
  await expect(c.reps).toHaveText('12 reps');
  await expect(workout.getByRole('button', {name: 'Start 3 sets'})).toBeVisible();
  await expect(workout.getByText('No notes yet.')).toBeVisible();

  await workout.getByRole('button', {name: 'Cancel'}).click();
  await expect(card(panel, "Today's plan")).toBeVisible();
});

test('WO-01 setup shows target weights and last week', async ({
  authedPage: page,
  db,
  user,
}) => {
  const goal = await seedExerciseGoal(db, user.id, {
    name: 'Bench',
    setPlan: JSON.stringify([
      {reps: 10, weight: 12},
      {reps: 8, weight: 12},
      {reps: 6, weight: 14},
    ]),
  });
  await seedExercise(db, user.id, {
    name: 'Bench',
    type: 'STRENGTH',
    exerciseGoalId: goal.id,
    goalDate: daysAgoIn(7),
    loggedAt: noonDaysAgo(7),
    exerciseSets: {
      create: [
        {position: 1, reps: 10, weight: 10},
        {position: 2, reps: 9, weight: 10},
        {position: 3, reps: 8, weight: 12},
      ],
    },
  });
  const {workout} = await startGoal(page, 'Bench');

  const table = workout.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Set',
    'Target',
    'Last week',
  ]);
  await expect(table.getByRole('row').nth(1)).toHaveText(
    /^1\s*10\s*×\s*12 kg\s*10\s*×\s*10 kg$/,
  );
  await expect(table.getByRole('row').nth(2)).toHaveText(
    /^2\s*8\s*×\s*12 kg\s*9\s*×\s*10 kg$/,
  );
  await expect(table.getByRole('row').nth(3)).toHaveText(
    /^3\s*6\s*×\s*14 kg\s*8\s*×\s*12 kg$/,
  );
});

test('WO-01 no last week column without a log', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {name: 'Rows', sets: 3, reps: 12});
  const {workout} = await startGoal(page, 'Rows');
  const table = workout.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Set', 'Target']);
  await expect(table.getByRole('cell')).toHaveText(['12', '12', '12']);
});

test('WO-01 single set label', async ({authedPage: page, db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Max hang', sets: 1, reps: 1});
  const {workout} = await startGoal(page, 'Max hang');
  await expect(workout.getByRole('button', {name: 'Start 1 set'})).toBeVisible();
  // Reps can't go below one.
  await expect(controls(workout).fewerReps).toBeDisabled();
});

test('WO-02 tempo and reps stay within limits', async ({authedPage: page, db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Curls', reps: 99});
  const {workout} = await startGoal(page, 'Curls');
  const c = controls(workout);

  await expect(c.tempo).toHaveText('3 s / rep');
  for (const expected of ['2.5', '2', '1.5', '1']) {
    await c.faster.click();
    await expect(c.tempo).toHaveText(`${expected} s / rep`);
  }
  await expect(c.faster).toBeDisabled();
  for (let i = 0; i < 10; i++) await c.slower.click();
  await expect(c.tempo).toHaveText('6 s / rep');
  await expect(c.slower).toBeDisabled();

  await c.moreReps.click();
  await expect(c.reps).toHaveText('100 reps');
  await expect(c.moreReps).toBeDisabled();
});

test('WO-03 start saves sound preferences and tempo', async ({
  authedPage: page,
  db,
  user,
}) => {
  const goal = await seedExerciseGoal(db, user.id, {name: 'Press', sets: 2, reps: 8});
  const {panel, workout} = await startGoal(page, 'Press');
  const c = controls(workout);
  await c.cuesOff.click();
  await c.music.click();
  await c.slower.click();
  await expect(c.cuesOff).toBeChecked();
  await expect(c.music).toHaveText('Music on');

  const tempoSaved = nextApiRequest(page, '/api/exercise-goals', 'PATCH');
  await workout.getByRole('button', {name: 'Start 2 sets'}).click();
  expect((await tempoSaved).postDataJSON()).toEqual({id: goal.id, tempoMs: 3500});
  expect(
    await page.evaluate(() => localStorage.getItem('clearcalorie:workout-prefs')),
  ).toBe(JSON.stringify({cues: 'off', music: true}));

  // With cues off the set begins without loading the voice.
  await expect(c.step).toHaveText('Set 1 of 2');
  await workout.getByRole('button', {name: 'Cancel without logging'}).click();
  await expect.poll(async () =>
    (await db.exerciseGoal.findUnique({where: {id: goal.id}}))?.tempoMs,
  ).toBe(3500);

  // The next workout starts from the saved choices.
  await panel.getByRole('button', {name: 'Start Press'}).click();
  const again = controls(card(panel, 'Press'));
  await expect(again.cuesOff).toBeChecked();
  await expect(again.music).toHaveText('Music on');
  await expect(again.tempo).toHaveText('3.5 s / rep');

  // After a reload the tempo comes from the goal itself.
  await page.reload();
  const {workout: reloaded} = await startGoal(page, 'Press');
  await expect(controls(reloaded).tempo).toHaveText('3.5 s / rep');
});

test('WO-12 a built-in exercise animates in time with the workout', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {name: 'Push-up', catalogId: 'push-up', sets: 2, reps: 10});
  // Today's plan shows its main area beside the name.
  await page.goto('/dashboard');
  const today = await openQuickLog(page, 'exercise');
  await expect(today.getByTitle('Main area worked')).toHaveText('Chest');

  const {workout} = await startGoal(page, 'Push-up');
  const c = controls(workout);
  // Without a saved tempo it starts at the animation's own rep time.
  await expect(c.tempo).toHaveText('3.5 s / rep');
  // The setup screen previews it at the chosen tempo, with no controls of its own.
  await expect(workout.getByRole('img', {name: 'Push-up'})).toBeVisible();
  await expect(workout.getByRole('button', {name: /animation$/})).toHaveCount(0);
  await workout.getByRole('button', {name: 'Start 2 sets'}).click();

  await expect(workout.getByRole('img', {name: 'Push-up'})).toBeVisible();
  await expect(workout.getByRole('group', {name: 'Areas worked'})).toContainText('Chest');
  // The workout drives it, so it has no controls of its own.
  await expect(workout.getByRole('button', {name: /animation$/})).toHaveCount(0);
  await workout.getByRole('button', {name: 'Cancel without logging'}).click();
});

test('WO-04/05/06/07 a full strength workout', async ({authedPage: page, db, user}) => {
  await page.clock.install();
  const goal = await seedExerciseGoal(db, user.id, {name: 'Deadlift', sets: 3, reps: 10, weight: 100});
  const {panel, workout} = await startGoal(page, 'Deadlift');
  const c = controls(workout);
  await freezeClock(page);
  await workout.getByRole('button', {name: 'Start 3 sets'}).click();

  // WO-04: five-beat count-in, then one beat per rep.
  await expect(c.step).toHaveText('Set 1 of 3');
  await expect(c.detail).toHaveText('10 reps @ 100');
  await expect(c.timer).toHaveText('5');
  await expect(workout.getByText('Get ready')).toBeVisible();
  await page.clock.runFor(2000);
  await expect(c.timer).toHaveText('4');
  await page.clock.runFor(8000);
  await expect(c.timer).toHaveText('Go');
  await expect(workout.getByText('of 10 reps')).toBeVisible();
  await page.clock.runFor(3000);
  await expect(c.timer).toHaveText('1');

  // WO-05: pausing freezes the count.
  await c.pause.click();
  await expect(c.pause).toHaveText('Resume');
  await expect(workout.getByText('Paused')).toBeVisible();
  await page.clock.runFor(10_000);
  await expect(c.timer).toHaveText('1');
  await c.pause.click();
  await expect(c.pause).toHaveText('Pause');

  // The set ends on its own after the last rep, then rest starts.
  await page.clock.runFor(27_000);
  await expect(c.step).toHaveText('Rest');
  await expect(c.detail).toHaveText('Next: set 2 of 3');
  await expect(c.timer).toHaveText('1:00');
  await expect(c.next).toHaveText('Skip rest');

  // Tempo can be changed while resting, ready for the next set.
  const tempoSaved = nextApiRequest(page, '/api/exercise-goals', 'PATCH');
  await c.slower.click();
  await expect(c.tempo).toHaveText('3.5 s / rep');
  expect((await tempoSaved).postDataJSON()).toEqual({id: goal.id, tempoMs: 3500});
  await c.faster.click();
  await expect(c.tempo).toHaveText('3 s / rep');

  // WO-06: rest can be adjusted, but not cut below 15 seconds.
  await workout.getByRole('button', {name: '+15s'}).click();
  await expect(c.timer).toHaveText('1:15');
  await workout.getByRole('button', {name: '−15s'}).click();
  await expect(c.timer).toHaveText('1:00');
  await page.clock.runFor(46_000);
  await expect(c.timer).toHaveText('0:14');
  await expect(workout.getByRole('button', {name: '−15s'})).toBeDisabled();
  await page.clock.runFor(14_000);
  await expect(c.step).toHaveText('Set 2 of 3');
  // Later sets get a three-beat count-in.
  await expect(c.timer).toHaveText('3');

  await c.next.click(); // Done, early
  await expect(c.step).toHaveText('Rest');
  await c.next.click(); // Skip rest
  await expect(c.step).toHaveText('Set 3 of 3');
  await expect(c.next).toHaveText('Finish');

  // WO-07: reps changed mid-workout are what gets logged.
  await c.fewerReps.click();
  await c.fewerReps.click();
  await expect(c.reps).toHaveText('8 reps');
  await c.next.click();

  // Each set is shown for checking first, with calories scaled to the work done.
  await expect(workout.getByText('Check what you did, then log it')).toBeVisible();
  await expect(workout.getByLabel('Set 1 reps')).toHaveValue('10');
  await expect(workout.getByLabel('Set 2 reps')).toHaveValue('10');
  await expect(workout.getByLabel('Set 3 reps')).toHaveValue('8');
  await expect(workout.getByLabel('Set 3 weight')).toHaveValue('100');
  await expect(workout.getByLabel('Calories burned')).toHaveValue('93');
  // The last set went heavier.
  await workout.getByLabel('Set 3 weight').fill('110');
  await expect(workout.getByLabel('Calories burned')).toHaveValue('96');
  const logged = nextApiRequest(page, '/api/exercise-goals/log');
  await workout.getByRole('button', {name: 'Done', exact: true}).click();
  expect((await logged).postDataJSON()).toEqual({
    goalId: goal.id,
    exerciseSets: [
      {reps: 10, weight: 100},
      {reps: 10, weight: 100},
      {reps: 8, weight: 110},
    ],
    calories: 96,
  });

  const plan = card(panel, "Today's plan");
  await expect(plan.getByText('All planned exercises done.')).toBeVisible();
  // The summary columns hold the set count and the top set.
  await expect.poll(() =>
    db.exerciseLog.findFirst({
      where: {exerciseGoalId: goal.id},
      select: {
        sets: true,
        reps: true,
        weight: true,
        exerciseSets: {orderBy: {position: 'asc'}, select: {reps: true, weight: true}},
      },
    }),
  ).toEqual({
    sets: 3,
    reps: 8,
    weight: 110,
    exerciseSets: [
      {reps: 10, weight: 100},
      {reps: 10, weight: 100},
      {reps: 8, weight: 110},
    ],
  });
});

test('WO-08 cancelling a workout logs nothing', async ({authedPage: page, db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Dips', sets: 2});
  const logs = trackRequests(page, '/api/exercise-goals/log');
  const {panel, workout} = await startGoal(page, 'Dips');
  await workout.getByRole('button', {name: 'Start 2 sets'}).click();
  const c = controls(workout);
  await expect(c.step).toHaveText('Set 1 of 2');
  // Cues can be changed mid-workout, and that choice is remembered.
  await c.tones.click();
  await expect(c.tones).toBeChecked();
  expect(
    await page.evaluate(() => localStorage.getItem('clearcalorie:workout-prefs')),
  ).toBe(JSON.stringify({cues: 'tones', music: false}));
  await workout.getByRole('button', {name: 'Cancel without logging'}).click();

  const plan = card(panel, "Today's plan");
  await expect(plan.getByRole('button', {name: 'Start Dips'})).toBeVisible();
  await expect(plan.getByText('0 of 1 done')).toBeVisible();
  expect(logs).toEqual([]);
});

test('WO-09 timed workout counts down and logs', async ({authedPage: page, db, user}) => {
  await page.clock.install();
  const goal = await seedExerciseGoal(db, user.id, {
    name: 'Rowing',
    type: 'TIME',
    durationMin: 1,
    sets: null,
    reps: null,
  });
  await page.goto('/dashboard');
  const panel = await openQuickLog(page, 'exercise');
  await freezeClock(page);
  await panel.getByRole('button', {name: 'Start Rowing'}).click();
  const workout = card(panel, 'Rowing');
  const c = controls(workout);

  // Starts on its own once the voice is ready; no setup screen.
  await expect(c.step).toHaveText('Workout');
  await expect(c.detail).toHaveText('1 min');
  await expect(c.timer).toHaveText('5');
  await page.clock.runFor(10_000);
  await expect(c.timer).toHaveText('1:00');
  await expect(workout.getByText('Remaining')).toBeVisible();
  await page.clock.runFor(30_000);
  await expect(c.timer).toHaveText('0:30');

  await page.clock.runFor(30_000);
  await expect(workout.getByLabel('Set 1 time')).toHaveValue('1:00');
  const logged = nextApiRequest(page, '/api/exercise-goals/log');
  await workout.getByRole('button', {name: 'Done', exact: true}).click();
  expect((await logged).postDataJSON()).toEqual({goalId: goal.id});
  await expect(card(panel, "Today's plan").getByText('All planned exercises done.')).toBeVisible();
});

test('WO-09 timed workout waits for the voice and can be cancelled', async ({
  authedPage: page,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {name: 'Bike', type: 'TIME', durationMin: 5, sets: null, reps: null});
  // Hold the voice clips so the loading state stays up.
  await page.route('**/audio/voice/**', () => {});
  const {panel, workout} = await startGoal(page, 'Bike');
  await expect(workout.getByRole('status')).toHaveText('Loading voice…');
  await workout.getByRole('button', {name: 'Cancel'}).click();
  await expect(card(panel, "Today's plan").getByRole('button', {name: 'Start Bike'})).toBeVisible();
});

test('WO-10 workout still starts when voice files fail', async ({authedPage: page, db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Swim', type: 'TIME', durationMin: 5, sets: null, reps: null});
  await page.route('**/audio/voice/**', (route) => route.abort());
  const {workout} = await startGoal(page, 'Swim');
  await expect(controls(workout).step).toHaveText('Workout');
});

test.describe('WO-11 notes during a workout', () => {
  test('add notes with links', async ({authedPage: page, db, user}) => {
    const goal = await seedExerciseGoal(db, user.id, {name: 'Pull-ups'});
    const {workout} = await startGoal(page, 'Pull-ups');

    await workout.getByRole('button', {name: 'Add'}).click();
    const textarea = workout.getByLabel('Notes');
    await expect(textarea).toBeFocused();
    await expect(textarea).toHaveAttribute('placeholder', 'Add notes for this exercise');
    await textarea.fill('Form video: https://example.com/pullup. Also www.example.org!');

    const request = nextApiRequest(page, '/api/exercise-goals', 'PATCH');
    await workout.getByRole('button', {name: 'Save', exact: true}).click();
    const sent = await request;
    expect(sent.postDataJSON()).toEqual({
      id: goal.id,
      notes: 'Form video: https://example.com/pullup. Also www.example.org!',
    });
    expect((await sent.response())?.status()).toBe(204);

    const first = workout.getByRole('link', {name: 'https://example.com/pullup'});
    await expect(first).toHaveAttribute('href', 'https://example.com/pullup');
    await expect(first).toHaveAttribute('target', '_blank');
    await expect(first).toHaveAttribute('rel', 'noopener noreferrer');
    // Trailing punctuation stays outside the link; www links get https.
    const second = workout.getByRole('link', {name: 'www.example.org'});
    await expect(second).toHaveAttribute('href', 'https://www.example.org');
    expect((await db.exerciseGoal.findUnique({where: {id: goal.id}}))?.notes).toContain(
      'www.example.org!',
    );
  });

  test('cancel discards edits; failures are reported', async ({authedPage: page, db, user}) => {
    await seedExerciseGoal(db, user.id, {name: 'Rows', notes: 'Original'});
    const {workout} = await startGoal(page, 'Rows');
    await expect(workout.getByText('Original')).toBeVisible();

    await workout.getByRole('button', {name: 'Edit'}).click();
    await workout.getByLabel('Notes').fill('Changed');
    // The notes' Cancel comes after the setup screen's own Cancel.
    await workout.getByRole('button', {name: 'Cancel', exact: true}).last().click();
    await expect(workout.getByText('Original')).toBeVisible();

    await page.route('**/api/exercise-goals', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({status: 500, json: {error: 'nope'}})
        : route.continue(),
    );
    await workout.getByRole('button', {name: 'Edit'}).click();
    await workout.getByLabel('Notes').fill('Changed');
    await workout.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(workout.getByRole('alert')).toHaveText("Couldn't save notes. Try again.");
    await expect(workout.getByLabel('Notes')).toHaveValue('Changed');
  });
});

test('WO-13 a sequence runs its exercises in turn, with breaks that follow a change', async ({
  authedPage: page,
  db,
  user,
}) => {
  await page.clock.install();
  const goal = await seedExerciseGoal(db, user.id, {
    name: 'Cardio circuit',
    type: 'SEQUENCE',
    calories: 60,
    sets: 3,
    reps: 10,
    // Timed steps use the user's own exercise: animating 3D frames under the
    // fake clock is too slow.
    steps: JSON.stringify([
      {name: 'Skipping', durationSec: 30, restSec: 0},
      {name: 'Goblet squat', catalogId: 'goblet-squat', reps: 10, restSec: 60},
      {name: 'Skipping', durationSec: 30, restSec: 60},
    ]),
  });
  const {panel, workout} = await startGoal(page, 'Cardio circuit');
  const c = controls(workout);
  const skipBreak = workout.getByRole('button', {name: 'Skip break'});

  // The setup lists each step and the breaks between them.
  await expect(workout.getByRole('table')).toContainText('Goblet squat');
  await expect(workout.getByText('Break 1 min')).toHaveCount(2);
  await freezeClock(page);
  await workout.getByRole('button', {name: 'Start 3 steps'}).click();

  await expect(c.step).toHaveText('Skipping');
  await expect(c.detail).toHaveText('Step 1 of 3 · 30s');
  await expect(c.timer).toHaveText('5');
  await page.clock.runFor(10_000);
  await expect(c.timer).toHaveText('0:30');
  await page.clock.runFor(30_000);
  await expect(c.step).toHaveText('Break');
  await expect(c.detail).toHaveText('Next: Goblet squat · 10 reps');
  await expect(c.timer).toHaveText('1:00');

  // A shorter break carries on to the later breaks.
  await workout.getByRole('button', {name: '−15s'}).click();
  await expect(c.timer).toHaveText('0:45');
  await skipBreak.click();
  await expect(c.step).toHaveText('Goblet squat');
  await expect(c.detail).toHaveText('Step 2 of 3 · 10 reps');
  await c.next.click(); // Done
  await expect(c.step).toHaveText('Break');
  await expect(c.detail).toHaveText('Next: Skipping · 30s');
  await expect(c.timer).toHaveText('0:45');
  await skipBreak.click();
  await expect(c.detail).toHaveText('Step 3 of 3 · 30s');
  await expect(c.next).toHaveText('Finish');
  await c.next.click();

  // Each step is checked under its exercise, and steps can't be added.
  await expect(workout.getByText('Check what you did, then log it')).toBeVisible();
  await expect(workout.getByText('2. Goblet squat')).toBeVisible();
  await expect(workout.getByLabel('Step 2 reps')).toHaveValue('10');
  await expect(workout.getByLabel('Step 3 time')).toHaveValue('0:30');
  await expect(workout.getByRole('button', {name: 'Add set'})).toHaveCount(0);
  const logged = nextApiRequest(page, '/api/exercise-goals/log');
  await workout.getByRole('button', {name: 'Done', exact: true}).click();
  expect((await logged).postDataJSON()).toEqual({goalId: goal.id});
  await expect(card(panel, "Today's plan").getByText('All planned exercises done.')).toBeVisible();

  // One log for the whole sequence, with each step's exercise.
  const log = await db.exerciseLog.findFirstOrThrow({
    where: {userId: user.id},
    include: {exerciseSets: {orderBy: {position: 'asc'}}},
  });
  expect(log).toMatchObject({exerciseGoalId: goal.id, name: 'Cardio circuit', calories: 60});
  expect(
    log.exerciseSets.map((set) => [set.name, set.catalogId, set.reps, set.durationSec]),
  ).toEqual([
    ['Skipping', null, null, 30],
    ['Goblet squat', 'goblet-squat', 10, null],
    ['Skipping', null, null, 30],
  ]);
});
