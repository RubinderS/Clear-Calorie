import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  adjustRest,
  animationSync,
  currentCue,
  currentStepDurationMs,
  repsDone,
  setEndCue,
  setReps,
  setTempo,
  buildSequenceSteps,
  buildWorkoutSteps,
  elapsedMs,
  formatClock,
  nextStep,
  remainingMs,
  startWorkout,
  tickWorkout,
  togglePause,
  FIRST_LEAD_IN_BEATS,
  LEAD_IN_BEATS,
  LEAD_IN_BEAT_MS,
} from './workout';

const LEAD_IN_MS = FIRST_LEAD_IN_BEATS * LEAD_IN_BEAT_MS;
const LATER_LEAD_IN_MS = LEAD_IN_BEATS * LEAD_IN_BEAT_MS;

/** A plan of rep sets that all match. */
function repSets(sets: number, reps = 10) {
  return Array.from({length: sets}, () => ({reps}));
}

test('buildWorkoutSteps counts down timed sets with rests between', () => {
  assert.deepEqual(
    buildWorkoutSteps([{reps: 8}, {durationSec: 45}], 30_000),
    [
      {kind: 'set', set: 1, sets: 2, reps: 8},
      {kind: 'rest', durationMs: 30_000, nextSet: 2, sets: 2},
      {kind: 'work', durationMs: 45_000, set: 2, sets: 2},
    ],
  );
});

test('a workout records each set as done, reps or time', () => {
  let state = startWorkout(
    buildWorkoutSteps([{reps: 8}, {durationSec: 45}, {reps: 6}], 30_000),
    0,
  );
  assert.equal(state.reps, 8);
  state = nextStep(state, 1_000);
  state = nextStep(state, 2_000); // rest skipped
  // 20s of the hold after its lead-in, then ended early.
  state = nextStep(state, 2_000 + LATER_LEAD_IN_MS + 20_000);
  state = nextStep(state, 0);
  // A set planned with different reps starts at its own.
  assert.equal(state.reps, 6);
  state = nextStep(state, 0);
  assert.equal(state.done, true);
  assert.deepEqual(state.completed, [
    {reps: 8},
    {durationSec: 20},
    {reps: 6},
  ]);
});

test('buildWorkoutSteps makes one countdown for time goals', () => {
  assert.deepEqual(buildWorkoutSteps([{durationSec: 20 * 60}]), [
    {kind: 'work', durationMs: 20 * 60_000, set: 1, sets: 1},
  ]);
});

test('buildWorkoutSteps interleaves rests between strength sets', () => {
  assert.deepEqual(buildWorkoutSteps(repSets(3), 30_000), [
    {kind: 'set', set: 1, sets: 3, reps: 10},
    {kind: 'rest', durationMs: 30_000, nextSet: 2, sets: 3},
    {kind: 'set', set: 2, sets: 3, reps: 10},
    {kind: 'rest', durationMs: 30_000, nextSet: 3, sets: 3},
    {kind: 'set', set: 3, sets: 3, reps: 10},
  ]);
  assert.deepEqual(buildWorkoutSteps(repSets(1)), [
    {kind: 'set', set: 1, sets: 1, reps: 10},
  ]);
});

test('pausing freezes elapsed time and resuming continues it', () => {
  let state = startWorkout(
    buildWorkoutSteps([{durationSec: 60}]),
    0,
  );
  state = togglePause(state, LEAD_IN_MS + 10_000);
  assert.equal(elapsedMs(state.timer, 50_000), LEAD_IN_MS + 10_000);
  assert.equal(remainingMs(state, 50_000), 50_000);
  state = togglePause(state, 50_000);
  assert.equal(remainingMs(state, 55_000), 45_000);
});

test('tickWorkout finishes a time workout once its lead-in and countdown run out', () => {
  const state = startWorkout(
    buildWorkoutSteps([{durationSec: 60}]),
    0,
  );
  assert.equal(tickWorkout(state, LEAD_IN_MS + 59_999), state);
  assert.equal(tickWorkout(state, LEAD_IN_MS + 60_000).done, true);
});

test('currentCue counts a time workout in, then stays on go', () => {
  const state = startWorkout(
    buildWorkoutSteps([{durationSec: 60}]),
    0,
  );
  assert.deepEqual(currentCue(state, 0)?.cue, {type: 'leadIn', n: 5});
  assert.deepEqual(currentCue(state, LEAD_IN_BEAT_MS * 4)?.cue, {
    type: 'leadIn',
    n: 1,
  });
  const go = currentCue(state, LEAD_IN_MS + 30_000);
  assert.deepEqual(go?.cue, {type: 'go'});
  assert.equal(go?.key, currentCue(state, LEAD_IN_MS)?.key);
  assert.equal(remainingMs(state, LEAD_IN_MS), 60_000);
});

test('tickWorkout does not expire a paused countdown', () => {
  const state = togglePause(
    startWorkout(buildWorkoutSteps([{durationSec: 60}]), 0),
    30_000,
  );
  assert.equal(tickWorkout(state, 10 * 60_000).done, false);
});

test('a rest that ends while backgrounded starts the next set at its end time', () => {
  let state = startWorkout(
    buildWorkoutSteps(repSets(2), 60_000),
    0,
    {reps: 10, tempoMs: 3_000},
  );
  state = nextStep(state, 20_000); // set 1 done, rest begins
  state = tickWorkout(state, 100_000); // rest ended at 80s
  assert.deepEqual(state.steps[state.index], {
    kind: 'set',
    set: 2,
    sets: 2,
    reps: 10,
  });
  assert.equal(elapsedMs(state.timer, 100_000), 20_000);
  assert.equal(nextStep(state, 110_000).done, true);
});

test('adjustRest changes the current and later rests only', () => {
  let state = startWorkout(
    buildWorkoutSteps(repSets(3), 60_000),
    0,
  );
  state = nextStep(state, 0);
  state = adjustRest(state, 15_000);
  assert.deepEqual(
    state.steps.flatMap((step) =>
      step.kind === 'rest' ? [step.durationMs] : [],
    ),
    [75_000, 75_000],
  );
  state = adjustRest(state, -100_000);
  assert.equal(remainingMs(state, 0), 0);
});

test('formatClock renders minutes and hours', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(1), '0:01');
  assert.equal(formatClock(65_000), '1:05');
  assert.equal(formatClock(3_725_000), '1:02:05');
});

function strength(sets: number, reps: number, tempoMs = 2_000) {
  return startWorkout(buildWorkoutSteps(repSets(sets), 60_000), 0, {
    reps,
    tempoMs,
  });
}

test('a set lasts its lead-in plus one tempo beat per rep, then rests', () => {
  const state = strength(2, 5);
  const setMs = LEAD_IN_MS + 5 * 2_000;
  assert.equal(remainingMs(state, 0), setMs);
  assert.equal(tickWorkout(state, setMs - 1).index, 0);
  const resting = tickWorkout(state, setMs);
  assert.equal(resting.steps[resting.index].kind, 'rest');
  assert.equal(resting.setsCompleted, 1);
  const next = tickWorkout(state, setMs + 60_000);
  assert.deepEqual(next.steps[next.index], {
    kind: 'set',
    set: 2,
    sets: 2,
    reps: 5,
  });
  const end = setMs + 60_000 + LATER_LEAD_IN_MS + 5 * 2_000;
  assert.equal(tickWorkout(state, end).done, true);
  assert.equal(tickWorkout(state, end).setsCompleted, 2);
});

test('currentCue counts a lead-in, go, then each rep', () => {
  const state = strength(1, 3);
  const cueAt = (now: number) => currentCue(state, now)?.cue;
  const at = (ms: number) => LEAD_IN_MS + ms;
  assert.deepEqual(cueAt(0), {type: 'leadIn', n: 5});
  assert.deepEqual(cueAt(LEAD_IN_BEAT_MS * 1.5), {type: 'leadIn', n: 4});
  assert.deepEqual(cueAt(LEAD_IN_BEAT_MS * 4), {type: 'leadIn', n: 1});
  assert.deepEqual(cueAt(at(0)), {type: 'go'});
  assert.deepEqual(cueAt(at(2_000)), {type: 'rep', n: 1});
  assert.deepEqual(cueAt(at(3_999)), {type: 'rep', n: 1});
  assert.deepEqual(cueAt(at(6_000)), {type: 'rep', n: 3});
  assert.equal(currentCue(state, at(2_100))?.lateMs, 100);
  assert.equal(currentCue(state, at(2_100))?.key, '0:6');
});

test('later sets count in from 3', () => {
  const state = strength(2, 3);
  const nextSet = tickWorkout(state, LEAD_IN_MS + 6_000 + 60_000);
  const start = LEAD_IN_MS + 66_000;
  assert.deepEqual(currentCue(nextSet, start)?.cue, {type: 'leadIn', n: 3});
  assert.deepEqual(currentCue(nextSet, start + LATER_LEAD_IN_MS)?.cue, {
    type: 'go',
  });
});

test('currentCue keeps the final rep after the set ends between ticks', () => {
  const state = strength(1, 3);
  const cue = currentCue(state, LEAD_IN_MS + 6_040);
  assert.deepEqual(cue?.cue, {type: 'rep', n: 3});
  assert.equal(cue?.lateMs, 40);
});

test('currentCue is silent during rests', () => {
  const resting = nextStep(strength(2, 3), 4_000);
  assert.equal(currentCue(resting, 5_000), null);
});

test('setTempo mid-set keeps reps done and the cue key', () => {
  let state = strength(1, 10, 2_000);
  const now = LEAD_IN_MS + 5_000; // 2.5 reps in
  const before = currentCue(state, now);
  state = setTempo(state, 4_000, now);
  assert.equal(repsDone(state, now), 2);
  assert.equal(currentCue(state, now)?.key, before?.key);
  // Half a rep left at the new tempo.
  assert.equal(repsDone(state, now + 1_999), 2);
  assert.equal(repsDone(state, now + 2_000), 3);
});

test('setTempo during rest leaves the rest timer and sets the next set', () => {
  const setMs = LEAD_IN_MS + 3 * 2_000;
  const resting = tickWorkout(strength(2, 3), setMs);
  const now = setMs + 20_000;
  const state = setTempo(resting, 4_000, now);
  assert.equal(state.steps[state.index].kind, 'rest');
  assert.equal(remainingMs(state, now), remainingMs(resting, now));
  const next = tickWorkout(state, setMs + 60_000);
  assert.equal(remainingMs(next, setMs + 60_000), LATER_LEAD_IN_MS + 3 * 4_000);
});

test('setTempo clamps to the allowed range', () => {
  assert.equal(setTempo(strength(1, 3), 100, 0).tempoMs, 1_000);
  assert.equal(setTempo(strength(1, 3), 60_000, 0).tempoMs, 6_000);
});

test('lowering reps below those done ends the set', () => {
  let state = strength(2, 10);
  const now = LEAD_IN_MS + 8_000; // 4 reps done
  state = setReps(state, 2);
  state = tickWorkout(state, now);
  assert.equal(state.steps[state.index].kind, 'rest');
  assert.equal(state.reps, 2);
  assert.equal(setReps(state, 0).reps, 1);
});

test('ending a set early still counts it', () => {
  let state = strength(3, 10);
  state = nextStep(state, 5_000);
  state = nextStep(state, 10_000);
  assert.equal(state.setsCompleted, 1);
  state = nextStep(state, 15_000);
  state = nextStep(state, 16_000);
  state = nextStep(state, 17_000);
  assert.equal(state.done, true);
  assert.equal(state.setsCompleted, 3);
});

test('each set keeps the reps it ended with', () => {
  let state = strength(3, 10);
  state = nextStep(state, 5_000); // set 1 done at 10 reps; resting
  assert.deepEqual(state.completed, [{reps: 10}]);
  state = setReps(state, 8);
  state = nextStep(state, 10_000); // set 2
  state = nextStep(state, 15_000); // set 2 done at 8 reps; resting
  state = nextStep(state, 16_000); // set 3
  state = setReps(state, 6);
  state = nextStep(state, 17_000); // set 3 done at 6 reps
  assert.equal(state.done, true);
  assert.deepEqual(state.completed, [{reps: 10}, {reps: 8}, {reps: 6}]);
});

test('setEndCue marks a set ending in a rest or the end of the workout', () => {
  const state = strength(2, 3); // rest is 60s
  const setMs = LEAD_IN_MS + 6_000;
  const resting = tickWorkout(state, setMs);
  assert.deepEqual(setEndCue(state, resting), {type: 'setEnd', lastSet: false});
  assert.equal(setEndCue(resting, tickWorkout(resting, setMs + 1_000)), null);
  const early = nextStep(resting, 30_000); // skip rest
  assert.equal(setEndCue(resting, early), null);
  const finished = nextStep(early, 31_000); // set 2 done early
  assert.deepEqual(setEndCue(early, finished), {type: 'setEnd', lastSet: true});
});

test('setEndCue stays quiet when catching up into the next set', () => {
  const state = strength(2, 3);
  assert.equal(setEndCue(state, tickWorkout(state, LEAD_IN_MS + 66_000)), null);
});

test('animationSync starts each rep on its beat and keeps moving through rests', () => {
  const state = strength(2, 3);
  // Moving through the count-in, a beat ahead, so a rep starts on "go".
  assert.deepEqual(animationSync(state, LEAD_IN_MS - 500), {
    key: 'sync:0:-1:2000:true',
    message: {cmd: 'sync', repMs: 2_000, repElapsedMs: 1_500, playing: true},
  });
  assert.deepEqual(animationSync(state, LEAD_IN_MS + 2_500), {
    key: 'sync:0:1:2000:true',
    message: {cmd: 'sync', repMs: 2_000, repElapsedMs: 500, playing: true},
  });
  // Same rep, same key: no resync mid-rep.
  assert.equal(
    animationSync(state, LEAD_IN_MS + 2_100).key,
    animationSync(state, LEAD_IN_MS + 3_900).key,
  );
  const paused = togglePause(state, LEAD_IN_MS + 2_500);
  assert.deepEqual(animationSync(paused, LEAD_IN_MS + 9_000).message, {
    cmd: 'sync',
    repMs: 2_000,
    repElapsedMs: 500,
    playing: false,
  });
  const resting = tickWorkout(state, LEAD_IN_MS + 6_000);
  assert.deepEqual(animationSync(resting, LEAD_IN_MS + 6_000).message, {cmd: 'free', playing: true});
});

test('animationSync follows a tempo change and lets timed work run free', () => {
  const state = setTempo(strength(1, 5), 4_000, LEAD_IN_MS + 1_000);
  assert.deepEqual(animationSync(state, LEAD_IN_MS + 1_000).message, {
    cmd: 'sync',
    repMs: 4_000,
    repElapsedMs: 2_000,
    playing: true,
  });
  const timed = startWorkout(buildWorkoutSteps([{durationSec: 60}]), 0);
  assert.deepEqual(animationSync(timed, 0).message, {cmd: 'free', playing: true});
  assert.deepEqual(animationSync(timed, LEAD_IN_MS + 1).message, {cmd: 'free', playing: true});
});

test('animationSync previews the next exercise during a sequence break', () => {
  const state = startWorkout(
    buildSequenceSteps([
      {durationSec: 45, restSec: 0, part: {name: 'Jacks', catalogId: 'jumping-jacks', tempoMs: 2_000}},
      {reps: 12, restSec: 30, part: {name: 'Squats', catalogId: 'squat', tempoMs: 4_000}},
    ]),
    0,
  );
  const breaking = nextStep(state, 1_000);
  assert.equal(breaking.steps[breaking.index].kind, 'rest');
  assert.deepEqual(animationSync(breaking, 1_000).message, {cmd: 'free', playing: true});
  const paused = togglePause(breaking, 2_000);
  assert.deepEqual(animationSync(paused, 3_000).message, {cmd: 'free', playing: false});
});

const JACKS = {name: 'Jumping jacks', catalogId: 'jumping-jacks', tempoMs: 2_000};
const SQUATS = {name: 'Squats', catalogId: 'squat', tempoMs: 4_000};

/** Jumping jacks for 45s, squats after a 30s break, then squats again after 60s. */
function circuit() {
  return buildSequenceSteps([
    {durationSec: 45, restSec: 0, part: JACKS},
    {reps: 12, restSec: 30, part: SQUATS},
    {reps: 12, restSec: 60, part: SQUATS},
  ]);
}

test('buildSequenceSteps adds breaks only where planned and tags each exercise', () => {
  assert.deepEqual(
    buildSequenceSteps([
      {durationSec: 45, restSec: 30, part: JACKS},
      {reps: 10, restSec: 0, part: SQUATS},
      {reps: 8, restSec: 45, part: SQUATS},
    ]),
    [
      {kind: 'work', durationMs: 45_000, set: 1, sets: 3, part: JACKS},
      {kind: 'set', set: 2, sets: 3, reps: 10, part: SQUATS},
      {kind: 'rest', durationMs: 45_000, nextSet: 3, sets: 3, next: SQUATS},
      {kind: 'set', set: 3, sets: 3, reps: 8, part: SQUATS},
    ],
  );
});

test('adjustRest moves every later break in a sequence by the same amount', () => {
  let state = startWorkout(circuit(), 0);
  state = nextStep(state, 0);
  state = adjustRest(state, 15_000);
  assert.deepEqual(
    state.steps.flatMap((step) =>
      step.kind === 'rest' ? [step.durationMs] : [],
    ),
    [45_000, 75_000],
  );
});

test("a sequence uses each exercise's tempo and keeps reps to one exercise", () => {
  const steps = buildSequenceSteps([
    {reps: 10, part: JACKS},
    {reps: 10, part: SQUATS},
  ]);
  let state = startWorkout(steps, 0);
  assert.equal(state.tempoMs, 2_000);
  state = setReps(state, 15);
  state = nextStep(state, 0);
  assert.equal(state.reps, 10);
  assert.equal(state.tempoMs, 4_000);
});

test('a sequence step with no break before it skips the count-in but sounds the end', () => {
  const steps = buildSequenceSteps([
    {durationSec: 45, part: JACKS},
    {reps: 10, part: SQUATS},
  ]);
  const first = startWorkout(steps, 0);
  const second = tickWorkout(first, LEAD_IN_MS + 45_000);
  assert.equal(second.index, 1);
  assert.equal(currentStepDurationMs(second), 10 * 4_000);
  assert.deepEqual(setEndCue(first, second), {type: 'setEnd', lastSet: false});
});

test("setTempo during a break applies to the next exercise's sets", () => {
  let state = startWorkout(circuit(), 0);
  state = nextStep(state, 0);
  assert.equal(state.steps[state.index].kind, 'rest');
  state = setTempo(state, 3_000, 0);
  state = nextStep(nextStep(state, 0), 0);
  assert.equal(state.tempoMs, 3_000);
  state = nextStep(nextStep(state, 0), 0);
  assert.equal(state.tempoMs, 3_000);
});

test('a finished sequence records one set per step', () => {
  let state = startWorkout(circuit(), 0);
  while (!state.done) state = nextStep(state, LEAD_IN_MS + 45_000);
  assert.deepEqual(state.completed, [
    {durationSec: 45},
    {reps: 12},
    {reps: 12},
  ]);
});
