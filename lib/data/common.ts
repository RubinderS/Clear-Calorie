/** Bounds on a date field; any combination may be set. */
export type DateRange = {gte?: Date; lte?: Date; lt?: Date};

export type SortOrder = 'asc' | 'desc';

/** A range as a query condition; undefined matches everything. */
export function inRange(range: DateRange | undefined) {
  if (!range) return undefined;
  const condition: {$gte?: Date; $lte?: Date; $lt?: Date} = {};
  if (range.gte) condition.$gte = range.gte;
  if (range.lte) condition.$lte = range.lte;
  if (range.lt) condition.$lt = range.lt;
  return condition;
}

/** A filter without the conditions left undefined. */
export function where<F extends Record<string, unknown>>(filter: F): F {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as F;
}

export const direction = (order: SortOrder) => (order === 'asc' ? 1 : -1);
