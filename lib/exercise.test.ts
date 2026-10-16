import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  EVERYDAY_MASK,
  countPlannedOn,
  daysToMask,
  exerciseDetailsSchema,
  exerciseInputSchema,
  exerciseSetSchema,
  formatExerciseDetail,
  inputSets,
  isActiveOn,
  isSameExerciseName,
  isUniform,
  maskToDays,
  parseSetPlan,
  setsOf,
  summarizeSets,
  toExerciseFields,
  toPlanFields,
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

test('each set is done for reps or for a time', () => {
  assert.equal(exerciseSetSchema.safeParse({reps: 10}).success, true);
  assert.equal(exerciseSetSchema.safeParse({durationSec: 45}).success, true);
  assert.equal(exerciseSetSchema.safeParse({weight: 20}).success, false);
  assert.equal(
    exerciseSetSchema.safeParse({reps: 10, durationSec: 45}).success,
    false,
  );
});

test('plans keep every set, summarized in the older columns', () => {
  const sets = [
    {reps: 10, weight: 40},
    {reps: 8, weight: 45},
    {durationSec: 45, weight: null},
  ];
  const fields = toPlanFields(sets);
  assert.deepEqual(
    {...fields, setPlan: undefined},
    {
      type: 'STRENGTH',
      durationMin: 1,
      sets: 3,
      reps: 8,
      weight: 45,
      setPlan: undefined,
    },
  );
  assert.deepEqual(parseSetPlan(fields.setPlan), sets);
  assert.deepEqual(setsOf(fields), sets);
  assert.equal(formatExerciseDetail(fields), '10 @ 40, 8 @ 45, 45s');

  // Only timed sets make a time exercise, with its total minutes.
  assert.deepEqual(toExerciseFields([{durationSec: 90}, {durationSec: 90}]), {
    type: 'TIME',
    durationMin: 3,
    sets: 2,
    reps: null,
    weight: null,
  });
  assert.equal(parseSetPlan('not json'), null);
});

test('formatExerciseDetail renders timed sets', () => {
  const timed = (...seconds: number[]) => ({
    type: 'TIME',
    exerciseSets: seconds.map((durationSec) => ({durationSec})),
  });
  assert.equal(formatExerciseDetail(timed(1800)), '30 min');
  assert.equal(formatExerciseDetail(timed(45, 45, 45)), '3 × 45s');
  assert.equal(formatExerciseDetail(timed(90, 60)), '1:30, 1 min');
});

test('older entries without stored sets are rebuilt from their summary', () => {
  assert.deepEqual(
    setsOf({type: 'STRENGTH', sets: 2, reps: 5, weight: 60, setPlan: null}),
    [
      {reps: 5, weight: 60},
      {reps: 5, weight: 60},
    ],
  );
  assert.deepEqual(setsOf({type: 'TIME', durationMin: 20}), [
    {durationSec: 1200, weight: null},
  ]);
});

test('inputs take listed sets or the older summary', () => {
  const listed = exerciseInputSchema.parse({
    exerciseSets: [{reps: 10}, {durationSec: 30}],
  });
  assert.deepEqual(inputSets(listed), [{reps: 10}, {durationSec: 30}]);
  const summary = exerciseInputSchema.parse({type: 'TIME', durationMin: 5});
  assert.deepEqual(inputSets(summary), [{durationSec: 300, weight: null}]);
  assert.equal(
    exerciseInputSchema.safeParse({exerciseSets: []}).success,
    false,
  );
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
  assert.deepEqual(toExerciseFields(inputSets(strength)), {
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
  assert.deepEqual(toExerciseFields(inputSets(time)), {
    type: 'TIME',
    durationMin: 30,
    sets: 1,
    reps: null,
    weight: null,
  });
});
