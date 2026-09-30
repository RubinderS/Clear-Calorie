import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  EVERYDAY_MASK,
  daysToMask,
  exerciseDetailsSchema,
  formatDays,
  formatExerciseDetail,
  isActiveOn,
  isSameExerciseName,
  maskToDays,
  toExerciseFields,
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

test('formatDays shows "Every day" or Monday-first labels', () => {
  assert.equal(formatDays(EVERYDAY_MASK), 'Every day');
  assert.equal(formatDays(daysToMask([0, 1, 3])), 'Mon, Wed, Sun');
  assert.equal(formatDays(0), '');
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
