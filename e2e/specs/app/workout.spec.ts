import type {Locator, Page} from '@playwright/test';
import {test, expect, nextApiRequest, trackRequests} from '../../fixtures/test';
import {seedExerciseGoal} from '../../fixtures/db';
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
    tones: workout.getByRole('button', {name: 'Tones'}),
    count: workout.getByRole('button', {name: 'Count'}),
    music: workout.getByRole('button', {name: /^Music (on|off)$/}),
    tempo: workout.getByText(/ s \/ rep$/),
    reps: workout.getByText(/^\d+ reps$/),
    slower: workout.getByRole('button', {name: 'Increase tempo'}),
    faster: workout.getByRole('button', {name: 'Decrease tempo'}),
    moreReps: workout.getByRole('button', {name: 'Increase reps'}),
    fewerReps: workout.getByRole('button', {name: 'Decrease reps'}),
    pause: workout.getByRole('button', {name: /^(Pause|Resume)$/}),
    next: workout.getByRole('button', {name: /^(Set done|Skip rest|Finish)$/}),
  };
}

test('WO-01 strength setup screen', async ({authedPage: page, db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Squats', sets: 3, reps: 12, weight: 40, tempoMs: 2000});
  const {panel, workout} = await startGoal(page, 'Squats');
  const c = controls(workout);

  await expect(workout.getByRole('group', {name: 'Sound'})).toBeVisible();
  await expect(c.tones).toHaveAttribute('aria-pressed', 'true');
  await expect(c.count).toHaveAttribute('aria-pressed', 'false');
  await expect(c.music).toHaveText('Music off');
  await expect(c.tempo).toHaveText('2 s / rep');
  await expect(c.reps).toHaveText('12 reps');
  await expect(workout.getByRole('button', {name: 'Start 3 sets'})).toBeVisible();
  await expect(workout.getByText('No notes yet.')).toBeVisible();

  await workout.getByRole('button', {name: 'Cancel'}).click();
  await expect(card(panel, "Today's plan")).toBeVisible();
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
  await c.count.click();
  await c.music.click();
  await c.slower.click();
  await expect(c.music).toHaveText('Music on');

  const tempoSaved = nextApiRequest(page, '/api/exercise-goals', 'PATCH');
  await workout.getByRole('button', {name: 'Start 2 sets'}).click();
  expect((await tempoSaved).postDataJSON()).toEqual({id: goal.id, tempoMs: 3500});
  expect(
    await page.evaluate(() => localStorage.getItem('clearcalorie:workout-prefs')),
  ).toBe(JSON.stringify({mode: 'count', music: true}));

  // Count mode waits for the voice, then the set begins.
  await expect(c.step).toHaveText('Set 1 of 2');
  await workout.getByRole('button', {name: 'Cancel without logging'}).click();
  await expect.poll(async () =>
    (await db.exerciseGoal.findUnique({where: {id: goal.id}}))?.tempoMs,
  ).toBe(3500);

  // The next workout starts from the saved choices.
  await panel.getByRole('button', {name: 'Start Press'}).click();
  const again = controls(card(panel, 'Press'));
  await expect(again.count).toHaveAttribute('aria-pressed', 'true');
  await expect(again.music).toHaveText('Music on');
  await expect(again.tempo).toHaveText('3.5 s / rep');

  // After a reload the tempo comes from the goal itself.
  await page.reload();
  const {workout: reloaded} = await startGoal(page, 'Press');
  await expect(controls(reloaded).tempo).toHaveText('3.5 s / rep');
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

  await c.next.click(); // Set done, early
  await expect(c.step).toHaveText('Rest');
  await c.next.click(); // Skip rest
  await expect(c.step).toHaveText('Set 3 of 3');
  await expect(c.next).toHaveText('Finish');

  // WO-07: reps changed mid-workout are what gets logged.
  await c.fewerReps.click();
  await c.fewerReps.click();
  await expect(c.reps).toHaveText('8 reps');
  const logged = nextApiRequest(page, '/api/exercise-goals/log');
  await c.next.click();
  expect((await logged).postDataJSON()).toEqual({goalId: goal.id, sets: 3, reps: 8});

  const plan = card(panel, "Today's plan");
  await expect(plan.getByText('All planned exercises done.')).toBeVisible();
  await expect.poll(() =>
    db.exerciseLog.findFirst({where: {exerciseGoalId: goal.id}, select: {sets: true, reps: true}}),
  ).toEqual({sets: 3, reps: 8});
});

test('WO-08 cancelling a workout logs nothing', async ({authedPage: page, db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Dips', sets: 2});
  const logs = trackRequests(page, '/api/exercise-goals/log');
  const {panel, workout} = await startGoal(page, 'Dips');
  await workout.getByRole('button', {name: 'Start 2 sets'}).click();
  await expect(controls(workout).step).toHaveText('Set 1 of 2');
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

  const logged = nextApiRequest(page, '/api/exercise-goals/log');
  await page.clock.runFor(30_000);
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
