import {nanoid} from 'nanoid';
import {db} from '@/lib/db';
import {where} from './common';
import {toPlain} from './plain';
import type {Goal} from './types';

export type GoalFields = Partial<Omit<Goal, 'id' | 'userId'>>;

export async function findGoals(userId: string): Promise<Goal | null> {
  const {Goal} = await db();
  const doc = await Goal.findOne({userId}).lean();
  return doc && toPlain(Goal, doc);
}

/** Updates the given fields, creating the row with defaults for the rest. */
export async function upsertGoals(userId: string, data: GoalFields): Promise<Goal> {
  const {Goal} = await db();
  const doc = await Goal.findOneAndUpdate(
    {userId},
    {$set: where(data), $setOnInsert: {_id: nanoid()}},
    {upsert: true, returnDocument: 'after', setDefaultsOnInsert: true},
  )
    .orFail()
    .lean();
  return toPlain(Goal, doc);
}
