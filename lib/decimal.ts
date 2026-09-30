import DecimalJs from 'decimal.js';

export const Decimal = DecimalJs.clone({precision: 40});
export type Decimal = DecimalJs;

export function sumNumbers(values: Iterable<DecimalJs.Value>): number {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.plus(value);
  }
  return total.toNumber();
}

export function getGoalProgress(value: number, goal: number) {
  const amount = new Decimal(value);
  const target = new Decimal(goal);
  const remaining = target.minus(amount);

  return {
    percent: target.gt(0) ? amount.div(target).times(100).toNumber() : 0,
    isOver: amount.gt(target),
    remaining: remaining.abs().toString(),
    value: amount.toString(),
  };
}
