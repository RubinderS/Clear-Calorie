import {db} from '@/lib/db';
import {where} from './common';
import {toPlain, toPlainAll} from './plain';
import type {ExerciseGoal} from './types';

export type ExerciseGoalFields = Partial<
  Omit<ExerciseGoal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
>;

/** The user's planned exercises, oldest first. */
export async function listExerciseGoals(userId: string): Promise<ExerciseGoal[]> {
  const {ExerciseGoal} = await db();
  const docs = await ExerciseGoal.find({userId}).sort({createdAt: 1}).lean();
  return toPlainAll(ExerciseGoal, docs);
}

export async function findExerciseGoal(
  userId: string,
  id: string,
): Promise<ExerciseGoal | null> {
  const {ExerciseGoal} = await db();
  const doc = await ExerciseGoal.findOne({_id: id, userId}).lean();
  return doc && toPlain(ExerciseGoal, doc);
}

export async function createExerciseGoal(
  userId: string,
  data: ExerciseGoalFields & Pick<ExerciseGoal, 'name' | 'daysMask'>,
): Promise<ExerciseGoal> {
  const {ExerciseGoal} = await db();
  const doc = await ExerciseGoal.create({...data, userId});
  return toPlain(ExerciseGoal, doc.toObject());
}

/**
 * Updates the user's goal, with `updatedAt` only if unchanged since then.
 * Null when there's no such goal (or it changed).
 */
export async function updateExerciseGoal(
  userId: string,
  id: string,
  data: ExerciseGoalFields,
  updatedAt?: Date,
): Promise<ExerciseGoal | null> {
  const {ExerciseGoal} = await db();
  const doc = await ExerciseGoal.findOneAndUpdate(
    where({_id: id, userId, updatedAt}),
    {$set: where(data)},
    {returnDocument: 'after'},
  ).lean();
  return doc && toPlain(ExerciseGoal, doc);
}

/**
 * Deletes the user's goal, with `updatedAt` only if unchanged since then.
 * Its logs stay, unlinked. False when there's no such goal (or it changed).
 */
export async function deleteExerciseGoal(
  userId: string,
  id: string,
  updatedAt?: Date,
) {
  const {ExerciseGoal, ExerciseLog} = await db();
  const result = await ExerciseGoal.deleteOne(where({_id: id, userId, updatedAt}));
  if (result.deletedCount === 0) return false;
  // Unlinking isn't an edit of the log, so its updatedAt stays.
  await ExerciseLog.updateMany(
    {exerciseGoalId: id},
    {$set: {exerciseGoalId: null}},
    {timestamps: false},
  );
  return true;
}

export type GoalRename = {
  id: string;
  updatedAt: Date;
  name: string;
  catalogId: string | null;
};

/**
 * Renames goals all or none: false, with nothing changed, when any goal is
 * missing or changed since its `updatedAt`. Without transactions, renames
 * already made are put back when a later one fails.
 */
export async function renameExerciseGoals(
  userId: string,
  renames: readonly GoalRename[],
) {
  const {ExerciseGoal} = await db();
  const done: {id: string; name: string; catalogId: string | null; updatedAt: Date}[] = [];
  for (const {id, updatedAt, name, catalogId} of renames) {
    const before = await ExerciseGoal.findOneAndUpdate(
      {_id: id, userId, updatedAt},
      {$set: {name, catalogId}},
      {returnDocument: 'before'},
    ).lean();
    if (!before) {
      for (const old of done.reverse()) {
        await ExerciseGoal.updateOne(
          {_id: old.id},
          {$set: {name: old.name, catalogId: old.catalogId, updatedAt: old.updatedAt}},
          {timestamps: false},
        );
      }
      return false;
    }
    done.push({
      id,
      name: before.name,
      catalogId: before.catalogId ?? null,
      updatedAt: before.updatedAt,
    });
  }
  return true;
}
