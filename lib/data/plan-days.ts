import {db} from '@/lib/db';
import {isUniqueViolation} from './errors';
import {toPlain, toPlainAll} from './plain';
import type {ExercisePlanDay} from './types';

/** The most recent frozen day. */
export async function findLatestPlanDay(userId: string): Promise<ExercisePlanDay | null> {
  const {ExercisePlanDay} = await db();
  const doc = await ExercisePlanDay.findOne({userId}).sort({date: -1}).lean();
  return doc && toPlain(ExercisePlanDay, doc);
}

export async function listPlanDays(
  userId: string,
  dates: readonly string[],
): Promise<ExercisePlanDay[]> {
  const {ExercisePlanDay} = await db();
  const docs = await ExercisePlanDay.find({userId, date: {$in: [...dates]}}).lean();
  return toPlainAll(ExercisePlanDay, docs);
}

/** Freezes days; days a concurrent request already froze are left as they are. */
export async function createPlanDays(rows: Omit<ExercisePlanDay, 'id'>[]) {
  const {ExercisePlanDay} = await db();
  try {
    // Unordered, so the days nobody froze yet are still written.
    await ExercisePlanDay.insertMany(rows, {ordered: false});
  } catch (error) {
    // A concurrent request froze the same days; its rows are equivalent.
    const writeErrors = (error as {writeErrors?: unknown[]}).writeErrors;
    const onlyDuplicates = writeErrors
      ? writeErrors.every(
          (writeError) =>
            isUniqueViolation(writeError) ||
            isUniqueViolation((writeError as {err?: unknown}).err),
        )
      : isUniqueViolation(error);
    if (!onlyDuplicates) throw error;
  }
}
