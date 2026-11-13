import {nanoid} from 'nanoid';
import {db} from '@/lib/db';
import {toPlain, toPlainAll} from './plain';
import type {ExerciseWeekSwap} from './types';

export async function findWeekSwap(
  userId: string,
  weekStart: string,
): Promise<ExerciseWeekSwap | null> {
  const {ExerciseWeekSwap} = await db();
  const doc = await ExerciseWeekSwap.findOne({userId, weekStart}).lean();
  return doc && toPlain(ExerciseWeekSwap, doc);
}

export async function listWeekSwaps(
  userId: string,
  weekStarts: readonly string[],
): Promise<ExerciseWeekSwap[]> {
  const {ExerciseWeekSwap} = await db();
  const docs = await ExerciseWeekSwap.find({
    userId,
    weekStart: {$in: [...new Set(weekStarts)]},
  }).lean();
  return toPlainAll(ExerciseWeekSwap, docs);
}

export async function upsertWeekSwap(
  userId: string,
  weekStart: string,
  dayMap: number[],
) {
  const {ExerciseWeekSwap} = await db();
  await ExerciseWeekSwap.updateOne(
    {userId, weekStart},
    {$set: {dayMap}, $setOnInsert: {_id: nanoid()}},
    {upsert: true},
  );
}

export async function deleteWeekSwap(userId: string, weekStart: string) {
  const {ExerciseWeekSwap} = await db();
  await ExerciseWeekSwap.deleteOne({userId, weekStart});
}
