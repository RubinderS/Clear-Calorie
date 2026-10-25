import {compare, hash} from 'bcryptjs';
import {createUserWithGoals, findUserByEmail} from './data/users';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, hashed: string) {
  return compare(password, hashed);
}

export async function createUser(
  email: string,
  password: string,
  name?: string,
) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error('User already exists');
  }

  const hashed = await hashPassword(password);
  return createUserWithGoals({
    email: normalizedEmail,
    name: name?.trim() || null,
    password: hashed,
  });
}

export async function getUserByEmail(email: string) {
  return findUserByEmail(normalizeEmail(email));
}
