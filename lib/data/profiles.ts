import {nanoid} from 'nanoid';
import {db} from '@/lib/db';
import {toPlain} from './plain';
import type {Profile} from './types';

export type ProfileFields = Omit<Profile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

export async function findProfile(userId: string): Promise<Profile | null> {
  const {Profile} = await db();
  const doc = await Profile.findOne({userId}).lean();
  return doc && toPlain(Profile, doc);
}

export async function upsertProfile(userId: string, data: ProfileFields): Promise<Profile> {
  const {Profile} = await db();
  const doc = await Profile.findOneAndUpdate(
    {userId},
    {$set: data, $setOnInsert: {_id: nanoid()}},
    {upsert: true, returnDocument: 'after', setDefaultsOnInsert: true},
  )
    .orFail()
    .lean();
  return toPlain(Profile, doc);
}
