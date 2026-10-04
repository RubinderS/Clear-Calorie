import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseEstimate} from './ai';

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
