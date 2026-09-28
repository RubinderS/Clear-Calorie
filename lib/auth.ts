import {compare, hash} from 'bcryptjs';
import {prisma} from './prisma';

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
  const existing = await prisma.user.findUnique({
    where: {email: normalizedEmail},
  });
  if (existing) {
    throw new Error('User already exists');
  }

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: name?.trim() || null,
      password: hashed,
      goals: {
        create: {},
      },
    },
  });

  return user;
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({where: {email: normalizeEmail(email)}});
}
