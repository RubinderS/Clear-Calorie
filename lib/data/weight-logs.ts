import {db} from '@/lib/db';
import {direction, inRange, where, type DateRange, type SortOrder} from './common';
import {toPlain, toPlainAll} from './plain';
import type {WeightLog} from './types';

export async function createWeightLog(userId: string, weight: number): Promise<WeightLog> {
  const {WeightLog} = await db();
  const doc = await WeightLog.create({userId, weight});
  return toPlain(WeightLog, doc.toObject());
}

export async function listWeightLogs(
  userId: string,
  {loggedAt, order = 'desc', take}: {loggedAt?: DateRange; order?: SortOrder; take?: number} = {},
): Promise<WeightLog[]> {
  const {WeightLog} = await db();
  const docs = await WeightLog.find(where({userId, loggedAt: inRange(loggedAt)}))
    .sort({loggedAt: direction(order)})
    .limit(take ?? 0)
    .lean();
  return toPlainAll(WeightLog, docs);
}

/** The latest weigh-in, optionally only those in `loggedAt`. */
export async function findLatestWeightLog(
  userId: string,
  loggedAt?: DateRange,
): Promise<WeightLog | null> {
  const [latest] = await listWeightLogs(userId, {loggedAt, take: 1});
  return latest ?? null;
}

/** False when the entry doesn't exist or belongs to someone else. */
export async function deleteWeightLog(userId: string, id: string) {
  const {WeightLog} = await db();
  const result = await WeightLog.deleteOne({_id: id, userId});
  return result.deletedCount > 0;
}
