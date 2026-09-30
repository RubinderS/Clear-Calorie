import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Decimal, getGoalProgress, sumNumbers} from './decimal';

test('totals retain fractional values without binary floating-point artifacts', () => {
  assert.equal(sumNumbers([0.1, 0.2]), 0.3);
  assert.equal(sumNumbers(Array.from({length: 100}, () => 0.1)), 10);
  assert.equal(sumNumbers([12.34, 23.456, 4.567]), 40.363);
  assert.equal(sumNumbers([]), 0);
  assert.equal(sumNumbers([100, 200]), 300);
});

test('net calories and weekly accumulators use decimal arithmetic', () => {
  assert.equal(new Decimal(100.3).minus(100).toNumber(), 0.3);
  const weeklyTotal = new Decimal(0).plus(0.1).plus(0.2).plus(0.3);
  assert.equal(weeklyTotal.toNumber(), 0.6);
});

test('progress preserves fractional amounts and remaining values', () => {
  assert.deepEqual(getGoalProgress(0.1, 0.3), {
    percent: new Decimal(100).div(3).toNumber(),
    isOver: false,
    remaining: '0.2',
    value: '0.1',
  });
  assert.equal(getGoalProgress(12.34, 150).remaining, '137.66');
});

test('progress handles exceeded, met, zero, and negative net calorie values', () => {
  assert.deepEqual(getGoalProgress(0.3, 0.1), {
    percent: 300,
    isOver: true,
    remaining: '0.2',
    value: '0.3',
  });
  assert.equal(getGoalProgress(0.3, 0.3).remaining, '0');
  assert.equal(getGoalProgress(0, 0).percent, 0);
  assert.equal(getGoalProgress(0.1, 0).percent, 0);
  assert.equal(getGoalProgress(-0.2, 0.3).remaining, '0.5');
});

test('decimal chart bounds and progress clamping preserve fractional values', () => {
  assert.equal(Decimal.max(0.1, 0.3, 0.2).toNumber(), 0.3);
  assert.equal(Decimal.min(100, Decimal.max(0, 33.33)).toString(), '33.33');
  assert.equal(Decimal.min(100, Decimal.max(0, -0.1)).toNumber(), 0);
  assert.equal(Decimal.min(100, Decimal.max(0, 100.1)).toNumber(), 100);
});

test('exercise rounding retains integer-field behavior', () => {
  assert.equal(
    new Decimal('12.4').toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL).toNumber(),
    12,
  );
  assert.equal(
    new Decimal('12.5').toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL).toNumber(),
    13,
  );
  assert.equal(
    new Decimal('-0.5').toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL).toNumber(),
    -0,
  );
});
