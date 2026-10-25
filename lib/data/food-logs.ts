import {db} from '@/lib/db';
import {direction, inRange, where, type DateRange, type SortOrder} from './common';
import {escapeRegExp, toPlain, toPlainAll} from './plain';
import type {FoodLog} from './types';

export type FoodLogFields = Pick<
  FoodLog,
  'name' | 'calories' | 'protein' | 'carbs' | 'fat' | 'saturatedFat'
>;

export async function createFoodLog(
  data: FoodLogFields &
    Pick<FoodLog, 'userId' | 'healthAlertLevel' | 'healthAlertMessage'>,
): Promise<FoodLog> {
  const {FoodLog} = await db();
  const doc = await FoodLog.create(data);
  return toPlain(FoodLog, doc.toObject());
}

export async function listFoodLogs(
  userId: string,
  {
    loggedAt,
    nameContains,
    order = 'desc',
    take,
  }: {loggedAt?: DateRange; nameContains?: string; order?: SortOrder; take?: number} = {},
): Promise<FoodLog[]> {
  const {FoodLog} = await db();
  const docs = await FoodLog.find(
    where({
      userId,
      loggedAt: inRange(loggedAt),
      // Case-insensitive, like SQLite's LIKE was.
      name: nameContains
        ? {$regex: escapeRegExp(nameContains), $options: 'i'}
        : undefined,
    }),
  )
    .sort({loggedAt: direction(order)})
    .limit(take ?? 0)
    .lean();
  return toPlainAll(FoodLog, docs);
}

export async function findFoodLog(userId: string, id: string): Promise<FoodLog | null> {
  const {FoodLog} = await db();
  const doc = await FoodLog.findOne({_id: id, userId}).lean();
  return doc && toPlain(FoodLog, doc);
}

export async function updateFoodLog(id: string, data: FoodLogFields): Promise<FoodLog> {
  const {FoodLog} = await db();
  const doc = await FoodLog.findByIdAndUpdate(id, {$set: data}, {returnDocument: 'after'})
    .orFail()
    .lean();
  return toPlain(FoodLog, doc);
}

/** False when the entry doesn't exist or belongs to someone else. */
export async function deleteFoodLog(userId: string, id: string) {
  const {FoodLog} = await db();
  const result = await FoodLog.deleteOne({_id: id, userId});
  return result.deletedCount > 0;
}
