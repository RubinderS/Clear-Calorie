import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  EVERYDAY_MASK,
  countPlannedOn,
  daysToMask,
  exerciseDetailsSchema,
  formatExerciseDetail,
  isActiveOn,
  isSameExerciseName,
  isUniform,
  maskToDays,
  summarizeSets,
  toExerciseFields,
  uniformSets,
} from './exercise';

test('day masks round-trip and list days Monday-first', () => {
  assert.equal(daysToMask([0, 1, 2, 3, 4, 5, 6]), EVERYDAY_MASK);
  assert.equal(daysToMask([]), 0);
  assert.equal(daysToMask([1, 3, 5]), 0b0101010);
  assert.deepEqual(maskToDays(daysToMask([0, 3, 1])), [1, 3, 0]);
  assert.deepEqual(maskToDays(0), []);
});

test('isActiveOn checks individual weekdays', () => {
  const mask = daysToMask([2, 4]);
  assert.equal(isActiveOn(mask, 2), true);
  assert.equal(isActiveOn(mask, 4), true);
  assert.equal(isActiveOn(mask, 0), false);
  assert.equal(isActiveOn(EVERYDAY_MASK, 6), true);
});

test('countPlannedOn counts active goals that existed by the end of the day', () => {
  const dayEnd = new Date('2026-10-05T23:59:59.999Z');
  const goals = [
    {daysMask: daysToMask([1]), createdAt: new Date('2026-09-01T00:00:00Z')},
    {daysMask: EVERYDAY_MASK, createdAt: new Date('2026-10-05T08:00:00Z')},
    {daysMask: EVERYDAY_MASK, createdAt: new Date('2026-10-06T08:00:00Z')},
    {daysMask: daysToMask([2]), createdAt: new Date('2026-09-01T00:00:00Z')},
  ];
  assert.equal(countPlannedOn(goals, 1, dayEnd), 2);
  assert.equal(countPlannedOn(goals, 0, dayEnd), 1);
  assert.equal(countPlannedOn([], 1, dayEnd), 0);
});

test('formatExerciseDetail renders strength and time entries', () => {
  assert.equal(
    formatExerciseDetail({type: 'STRENGTH', sets: 3, reps: 10, weight: 50}),
    '3 × 10 @ 50',
  );
  assert.equal(
    formatExerciseDetail({type: 'STRENGTH', sets: 4, reps: 8, weight: null}),
    '4 × 8',
  );
  assert.equal(formatExerciseDetail({type: 'TIME', durationMin: 30}), '30 min');
});

test('formatExerciseDetail lists sets that differ', () => {
  const sets = (...list: [number, number | null][]) =>
    list.map(([reps, weight]) => ({reps, weight}));
  const entry = {type: 'STRENGTH', sets: 3, reps: 6, weight: 50};
  assert.equal(
    formatExerciseDetail({...entry, exerciseSets: sets([10, 40], [8, 45], [6, 50])}),
    '10 @ 40, 8 @ 45, 6 @ 50',
  );
  assert.equal(
    formatExerciseDetail({...entry, exerciseSets: sets([10, null], [8, null])}),
    '10, 8 reps',
  );
  assert.equal(
    formatExerciseDetail({...entry, exerciseSets: sets([10, 40], [8, null])}),
    '10 @ 40, 8',
  );
  assert.equal(
    formatExerciseDetail({...entry, exerciseSets: sets([5, 60], [5, 60])}),
    '2 × 5 @ 60',
  );
});

test('summarizeSets counts sets and picks the top set', () => {
  assert.deepEqual(
    summarizeSets([
      {reps: 10, weight: 40},
      {reps: 6, weight: 50},
      {reps: 8, weight: 50},
    ]),
    {sets: 3, reps: 8, weight: 50},
  );
  assert.deepEqual(summarizeSets([{reps: 10}, {reps: 12, weight: null}]), {
    sets: 2,
    reps: 12,
    weight: null,
  });
  assert.deepEqual(uniformSets(2, 10, undefined), [
    {reps: 10, weight: null},
    {reps: 10, weight: null},
  ]);
  assert.equal(isUniform(uniformSets(3, 8, 20)), true);
});

test('isSameExerciseName ignores case and surrounding whitespace', () => {
  assert.equal(isSameExerciseName('  Morning Run ', 'morning run'), true);
  assert.equal(isSameExerciseName('Morning run', 'Evening run'), false);
});

test('details schema enforces per-type required fields', () => {
  assert.equal(
    exerciseDetailsSchema.safeParse({type: 'STRENGTH', reps: 10}).success,
    false,
  );
  assert.equal(
    exerciseDetailsSchema.safeParse({type: 'TIME', durationMin: 0}).success,
    false,
  );
  assert.equal(
    exerciseDetailsSchema.safeParse({type: 'OTHER', durationMin: 10}).success,
    false,
  );

  const strength = exerciseDetailsSchema.parse({
    type: 'STRENGTH',
    sets: 3,
    reps: 10,
    durationMin: 45,
  });
  assert.deepEqual(toExerciseFields(strength), {
    type: 'STRENGTH',
    durationMin: null,
    sets: 3,
    reps: 10,
    weight: null,
  });

  const time = exerciseDetailsSchema.parse({
    type: 'TIME',
    durationMin: 30,
    sets: 3,
  });
  assert.deepEqual(toExerciseFields(time), {
    type: 'TIME',
    durationMin: 30,
    sets: null,
    reps: null,
    weight: null,
  });
});
