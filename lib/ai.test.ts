import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  buildExerciseDescription,
  parseEstimate,
  parseExerciseEstimate,
} from './ai';

const base = {
  name: 'Bacon and eggs',
  calories: 512.4,
  protein: 30.04,
  carbs: 2,
  fat: 40.06,
  saturatedFat: 50,
  assumptions: '3 rashers, 2 eggs',
};

test('normalises nutrition values', () => {
  const estimate = parseEstimate(base);
  assert.ok(estimate);
  assert.equal(estimate.calories, 512);
  assert.equal(estimate.protein, 30);
  assert.equal(estimate.fat, 40.1);
  assert.equal(estimate.saturatedFat, 40.1);
  assert.equal(estimate.healthAlert, undefined);
});

test('keeps caution and avoid health alerts', () => {
  const estimate = parseEstimate({
    ...base,
    healthAlert: {level: 'Avoid', message: 'High in saturated fat.'},
  });
  assert.deepEqual(estimate?.healthAlert, {
    level: 'avoid',
    message: 'High in saturated fat.',
  });
});

test('drops ok or empty health alerts', () => {
  assert.equal(
    parseEstimate({...base, healthAlert: {level: 'ok', message: 'Fine.'}})
      ?.healthAlert,
    undefined,
  );
  assert.equal(
    parseEstimate({...base, healthAlert: {level: 'caution', message: ' '}})
      ?.healthAlert,
    undefined,
  );
});

test('malformed health alert does not fail the estimate', () => {
  const estimate = parseEstimate({...base, healthAlert: {level: 'danger'}});
  assert.ok(estimate);
  assert.equal(estimate.healthAlert, undefined);
  assert.ok(parseEstimate({...base, healthAlert: 'avoid'}));
});

test('truncates long health alert messages', () => {
  const estimate = parseEstimate({
    ...base,
    healthAlert: {level: 'caution', message: 'x'.repeat(500)},
  });
  assert.equal(estimate?.healthAlert?.message.length, 200);
});

test('rejects estimates without a name or calories', () => {
  assert.equal(parseEstimate({calories: 100}), null);
  assert.equal(parseEstimate({name: 'Apple'}), null);
});

test('normalises exercise estimates', () => {
  assert.deepEqual(
    parseExerciseEstimate({calories: 312.6, assumptions: ' MET 9.8 '}),
    {calories: 313, assumptions: 'MET 9.8'},
  );
  assert.equal(
    parseExerciseEstimate({calories: 100, assumptions: 'x'.repeat(500)})
      ?.assumptions.length,
    300,
  );
});

test('rejects exercise estimates without valid calories', () => {
  assert.equal(parseExerciseEstimate({assumptions: 'Running'}), null);
  assert.equal(parseExerciseEstimate({calories: -50}), null);
});

test('describes time based exercise with body weight', () => {
  assert.equal(
    buildExerciseDescription(
      {name: 'Running', type: 'TIME', durationMin: 30},
      78,
    ),
    'Exercise: Running\nDuration: 30 min\nBody weight: 78 kg',
  );
});

test('describes strength exercise without body weight', () => {
  assert.equal(
    buildExerciseDescription(
      {name: 'Squats', type: 'STRENGTH', sets: 3, reps: 10, weight: 60},
      null,
    ),
    'Exercise: Squats\nSets: 3\nReps: 10\nLoad: 60 kg\nBody weight: not known; assume an average adult.',
  );
  assert.equal(
    buildExerciseDescription({name: 'Push ups', type: 'STRENGTH'}, null),
    'Exercise: Push ups\nBody weight: not known; assume an average adult.',
  );
});
