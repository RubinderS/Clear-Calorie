import {nanoid} from 'nanoid';
import {db} from '@/lib/db';
import {toPlain, toPlainAll} from './plain';
import type {SavedExerciseItem, SavedFoodItem} from './types';

type Fields<T> = Omit<T, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
export type SavedFoodFields = Fields<SavedFoodItem>;
export type SavedExerciseFields = Fields<SavedExerciseItem>;

const upsertOptions = {upsert: true, returnDocument: 'after', setDefaultsOnInsert: true} as const;

export async function listSavedFood(userId: string): Promise<SavedFoodItem[]> {
  const {SavedFoodItem} = await db();
  const docs = await SavedFoodItem.find({userId}).sort({name: 1}).lean();
  return toPlainAll(SavedFoodItem, docs);
}

export async function findSavedFoodByName(
  userId: string,
  name: string,
): Promise<SavedFoodItem | null> {
  const {SavedFoodItem} = await db();
  const doc = await SavedFoodItem.findOne({userId, name}).lean();
  return doc && toPlain(SavedFoodItem, doc);
}

/** Creates or replaces the user's item with this name. */
export async function upsertSavedFood(
  userId: string,
  data: SavedFoodFields,
): Promise<SavedFoodItem> {
  const {SavedFoodItem} = await db();
  const doc = await SavedFoodItem.findOneAndUpdate(
    {userId, name: data.name},
    {$set: data, $setOnInsert: {_id: nanoid()}},
    upsertOptions,
  )
    .orFail()
    .lean();
  return toPlain(SavedFoodItem, doc);
}

export async function deleteSavedFood(userId: string, id: string) {
  const {SavedFoodItem} = await db();
  await SavedFoodItem.deleteOne({_id: id, userId});
}

export async function listSavedExercises(userId: string): Promise<SavedExerciseItem[]> {
  const {SavedExerciseItem} = await db();
  const docs = await SavedExerciseItem.find({userId}).sort({name: 1}).lean();
  return toPlainAll(SavedExerciseItem, docs);
}

export async function findSavedExerciseByName(
  userId: string,
  name: string,
): Promise<SavedExerciseItem | null> {
  const {SavedExerciseItem} = await db();
  const doc = await SavedExerciseItem.findOne({userId, name}).lean();
  return doc && toPlain(SavedExerciseItem, doc);
}

/** Creates or replaces the user's item with this name. */
export async function upsertSavedExercise(
  userId: string,
  data: SavedExerciseFields,
): Promise<SavedExerciseItem> {
  const {SavedExerciseItem} = await db();
  const doc = await SavedExerciseItem.findOneAndUpdate(
    {userId, name: data.name},
    {$set: data, $setOnInsert: {_id: nanoid()}},
    upsertOptions,
  )
    .orFail()
    .lean();
  return toPlain(SavedExerciseItem, doc);
}

export async function deleteSavedExercise(userId: string, id: string) {
  const {SavedExerciseItem} = await db();
  await SavedExerciseItem.deleteOne({_id: id, userId});
}
