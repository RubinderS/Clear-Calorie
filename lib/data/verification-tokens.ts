import {db} from '@/lib/db';
import {toPlain} from './plain';
import type {VerificationToken} from './types';

export async function createVerificationToken(data: Omit<VerificationToken, 'id'>) {
  const {VerificationToken} = await db();
  await VerificationToken.create(data);
}

/** Expired tokens may still be found for up to a minute; check `expires`. */
export async function findVerificationToken(
  token: string,
): Promise<VerificationToken | null> {
  const {VerificationToken} = await db();
  const doc = await VerificationToken.findOne({token}).lean();
  return doc && toPlain(VerificationToken, doc);
}

export async function deleteVerificationToken(token: string) {
  const {VerificationToken} = await db();
  await VerificationToken.deleteOne({token});
}
