import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  adjustRest,
  currentCue,
  repsDone,
  setEndCue,
  setReps,
  setTempo,
  buildWorkoutSteps,
  elapsedMs,
  formatClock,
  nextStep,
  remainingMs,
  startWorkout,
  tickWorkout,
  togglePause,
} from './workout';

test('buildWorkoutSteps makes one countdown for time goals', () => {
  assert.deepEqual(buildWorkoutSteps({type: 'TIME', durationMin: 20}), [
    {kind: 'work', durationMs: 20 * 60_000},
  ]);
});

test('buildWorkoutSteps interleaves rests between strength sets', () => {
  assert.deepEqual(buildWorkoutSteps({type: 'STRENGTH', sets: 3}, 30_000), [
    {kind: 'set', set: 1, sets: 3},
    {kind: 'rest', durationMs: 30_000, nextSet: 2, sets: 3},
    {kind: 'set', set: 2, sets: 3},
    {kind: 'rest', durationMs: 30_000, nextSet: 3, sets: 3},
    {kind: 'set', set: 3, sets: 3},
  ]);
  assert.deepEqual(buildWorkoutSteps({type: 'STRENGTH', sets: 1}), [
    {kind: 'set', set: 1, sets: 1},
  ]);
});

test('pausing freezes elapsed time and resuming continues it', () => {
  let state = startWorkout(
    buildWorkoutSteps({type: 'TIME', durationMin: 1}),
    0,
  );
  state = togglePause(state, 10_000);
  assert.equal(elapsedMs(state.timer, 50_000), 10_000);
  assert.equal(remainingMs(state, 50_000), 50_000);
  state = togglePause(state, 50_000);
  assert.equal(remainingMs(state, 55_000), 45_000);
});

test('tickWorkout finishes a time workout once the countdown runs out', () => {
  const state = startWorkout(
    buildWorkoutSteps({type: 'TIME', durationMin: 1}),
    0,
  );
  assert.equal(tickWorkout(state, 59_999), state);
  assert.equal(tickWorkout(state, 60_000).done, true);
});

test('tickWorkout does not expire a paused countdown', () => {
  const state = togglePause(
    startWorkout(buildWorkoutSteps({type: 'TIME', durationMin: 1}), 0),
    30_000,
  );
  assert.equal(tickWorkout(state, 10 * 60_000).done, false);
});

test('a rest that ends while backgrounded starts the next set at its end time', () => {
  let state = startWorkout(
    buildWorkoutSteps({type: 'STRENGTH', sets: 2}, 60_000),
    0,
    {reps: 10, tempoMs: 3_000},
  );
  state = nextStep(state, 20_000); // set 1 done, rest begins
  state = tickWorkout(state, 100_000); // rest ended at 80s
  assert.deepEqual(state.steps[state.index], {kind: 'set', set: 2, sets: 2});
  assert.equal(elapsedMs(state.timer, 100_000), 20_000);
  assert.equal(nextStep(state, 110_000).done, true);
});

test('adjustRest changes the current and later rests only', () => {
  let state = startWorkout(
    buildWorkoutSteps({type: 'STRENGTH', sets: 3}, 60_000),
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
  return startWorkout(buildWorkoutSteps({type: 'STRENGTH', sets}, 60_000), 0, {
    reps,
    tempoMs,
  });
}

test('a set lasts its lead-in plus one tempo beat per rep, then rests', () => {
  const state = strength(2, 5); // 3s lead-in + 5 × 2s = 13s
  assert.equal(remainingMs(state, 0), 13_000);
  assert.equal(tickWorkout(state, 12_999).index, 0);
  const resting = tickWorkout(state, 13_000);
  assert.equal(resting.steps[resting.index].kind, 'rest');
  assert.equal(resting.setsCompleted, 1);
  const next = tickWorkout(state, 73_000);
  assert.deepEqual(next.steps[next.index], {kind: 'set', set: 2, sets: 2});
  assert.equal(tickWorkout(state, 86_000).done, true);
  assert.equal(tickWorkout(state, 86_000).setsCompleted, 2);
});

test('currentCue counts a lead-in, go, then each rep', () => {
  const state = strength(1, 3);
  const cueAt = (now: number) => currentCue(state, now)?.cue;
  assert.deepEqual(cueAt(0), {type: 'leadIn', n: 3});
  assert.deepEqual(cueAt(1_500), {type: 'leadIn', n: 2});
  assert.deepEqual(cueAt(2_000), {type: 'leadIn', n: 1});
  assert.deepEqual(cueAt(3_000), {type: 'go'});
  assert.deepEqual(cueAt(5_000), {type: 'rep', n: 1});
  assert.deepEqual(cueAt(6_999), {type: 'rep', n: 1});
  assert.deepEqual(cueAt(9_000), {type: 'rep', n: 3});
  assert.equal(currentCue(state, 5_100)?.lateMs, 100);
  assert.equal(currentCue(state, 5_100)?.key, '0:4');
});

test('currentCue keeps the final rep after the set ends between ticks', () => {
  const state = strength(1, 3);
  const cue = currentCue(state, 9_040);
  assert.deepEqual(cue?.cue, {type: 'rep', n: 3});
  assert.equal(cue?.lateMs, 40);
});

test('currentCue is silent outside sets', () => {
  const time = startWorkout(
    buildWorkoutSteps({type: 'TIME', durationMin: 1}),
    0,
  );
  assert.equal(currentCue(time, 1_000), null);
  const resting = nextStep(strength(2, 3), 4_000);
  assert.equal(currentCue(resting, 5_000), null);
});

test('setTempo mid-set keeps reps done and the cue key', () => {
  let state = strength(1, 10, 2_000);
  const before = currentCue(state, 8_000); // 2.5 reps in
  state = setTempo(state, 4_000, 8_000);
  assert.equal(repsDone(state, 8_000), 2);
  assert.equal(currentCue(state, 8_000)?.key, before?.key);
  // Half a rep left at the new tempo.
  assert.equal(repsDone(state, 9_999), 2);
  assert.equal(repsDone(state, 10_000), 3);
});

test('setTempo clamps to the allowed range', () => {
  assert.equal(setTempo(strength(1, 3), 100, 0).tempoMs, 1_000);
  assert.equal(setTempo(strength(1, 3), 60_000, 0).tempoMs, 6_000);
});

test('lowering reps below those done ends the set', () => {
  let state = strength(2, 10);
  state = setReps(state, 2); // 4 reps done at 11s
  state = tickWorkout(state, 11_000);
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

test('setEndCue marks a set ending in a rest or the end of the workout', () => {
  const state = strength(2, 3); // sets end at 9s; rest is 60s
  const resting = tickWorkout(state, 9_000);
  assert.deepEqual(setEndCue(state, resting), {type: 'setEnd', lastSet: false});
  assert.equal(setEndCue(resting, tickWorkout(resting, 10_000)), null);
  const early = nextStep(resting, 30_000); // skip rest
  assert.equal(setEndCue(resting, early), null);
  const finished = nextStep(early, 31_000); // set 2 done early
  assert.deepEqual(setEndCue(early, finished), {type: 'setEnd', lastSet: true});
});

test('setEndCue stays quiet when catching up into the next set', () => {
  const state = strength(2, 3);
  assert.equal(setEndCue(state, tickWorkout(state, 70_000)), null);
});
