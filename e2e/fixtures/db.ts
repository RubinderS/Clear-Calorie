// Direct database access for seeding rows the API can't create (past dates,
// tokens, plan snapshots) and for asserting what was persisted.
import {randomUUID} from 'node:crypto';
import {PrismaClient, type Prisma} from '@prisma/client';
import {hash} from 'bcryptjs';
import {SERVERS, dbUrl, type ServerName} from '../env';
import {EVERYDAY_MASK, daysToMask} from '../../lib/exercise';

export const DEFAULT_PASSWORD = 'Password1!';

const clients = new Map<ServerName, PrismaClient>();

export function getDb(server: ServerName): PrismaClient {
  let client = clients.get(server);
  if (!client) {
    client = new PrismaClient({datasourceUrl: dbUrl(SERVERS[server].dbFile)});
    clients.set(server, client);
  }
  return client;
}

// Low cost keeps per-test users fast; bcrypt reads the cost from the hash.
const hashes = new Map<string, Promise<string>>();
function hashFor(password: string) {
  let hashed = hashes.get(password);
  if (!hashed) {
    hashed = hash(password, 4);
    hashes.set(password, hashed);
  }
  return hashed;
}

export function uniqueEmail(prefix = 'user') {
  return `e2e-${prefix}-${randomUUID().slice(0, 12)}@example.com`;
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string | null;
};

export type CreateUserOptions = {
  email?: string;
  password?: string;
  name?: string | null;
  verified?: boolean;
  goals?: Partial<Omit<Prisma.GoalCreateWithoutUserInput, 'id'>> | null;
};

export async function createUser(
  db: PrismaClient,
  {
    email = uniqueEmail(),
    password = DEFAULT_PASSWORD,
    name = 'E2E User',
    verified = true,
    goals = {},
  }: CreateUserOptions = {},
): Promise<TestUser> {
  const user = await db.user.create({
    data: {
      email,
      name,
      password: await hashFor(password),
      emailVerified: verified ? new Date() : null,
      ...(goals && {goals: {create: goals}}),
    },
  });
  return {id: user.id, email: user.email, password, name: user.name};
}

type FoodSeed = Partial<Omit<Prisma.FoodLogUncheckedCreateInput, 'userId'>>;

export function seedFood(db: PrismaClient, userId: string, data: FoodSeed = {}) {
  return db.foodLog.create({
    data: {name: 'Seeded food', calories: 300, ...data, userId},
  });
}

type ExerciseSeed = Partial<
  Omit<Prisma.ExerciseLogUncheckedCreateInput, 'userId'>
>;

export function seedExercise(
  db: PrismaClient,
  userId: string,
  data: ExerciseSeed = {},
) {
  return db.exerciseLog.create({
    data: {
      name: 'Seeded exercise',
      type: 'TIME',
      calories: 200,
      durationMin: 30,
      ...data,
      userId,
    },
  });
}

export function seedWeight(
  db: PrismaClient,
  userId: string,
  data: {weight?: number; loggedAt?: Date} = {},
) {
  return db.weightLog.create({data: {weight: 75, ...data, userId}});
}

/** A tracked body metric; a waist preset in cm unless overridden. */
export function seedBodyMetric(
  db: PrismaClient,
  userId: string,
  data: Partial<Omit<Prisma.BodyMetricUncheckedCreateInput, 'userId'>> = {},
) {
  return db.bodyMetric.create({
    data: {key: 'waist', label: 'Waist', unit: 'cm', direction: 'down', ...data, userId},
  });
}

export function seedBodyMetricLog(
  db: PrismaClient,
  metricId: string,
  data: {value?: number; loggedAt?: Date} = {},
) {
  return db.bodyMetricLog.create({data: {value: 85, ...data, metricId}});
}

type GoalSeed = Partial<
  Omit<Prisma.ExerciseGoalUncheckedCreateInput, 'userId' | 'daysMask'>
> & {days?: number[]};

/** Planned exercise; every day unless `days` is given. */
export function seedExerciseGoal(
  db: PrismaClient,
  userId: string,
  {days, ...data}: GoalSeed = {},
) {
  return db.exerciseGoal.create({
    data: {
      name: 'Seeded goal',
      type: 'STRENGTH',
      calories: 100,
      sets: 3,
      reps: 10,
      ...data,
      daysMask: days ? daysToMask(days) : EVERYDAY_MASK,
      userId,
    },
  });
}

export function seedSavedFood(
  db: PrismaClient,
  userId: string,
  data: Partial<Omit<Prisma.SavedFoodItemUncheckedCreateInput, 'userId'>> = {},
) {
  return db.savedFoodItem.create({
    data: {name: `Saved ${randomUUID().slice(0, 6)}`, calories: 100, ...data, userId},
  });
}

export function seedSavedExercise(
  db: PrismaClient,
  userId: string,
  data: Partial<
    Omit<Prisma.SavedExerciseItemUncheckedCreateInput, 'userId'>
  > = {},
) {
  return db.savedExerciseItem.create({
    data: {
      name: `Saved ${randomUUID().slice(0, 6)}`,
      type: 'TIME',
      calories: 100,
      durationMin: 10,
      ...data,
      userId,
    },
  });
}

export async function seedVerificationToken(
  db: PrismaClient,
  email: string,
  {expires = new Date(Date.now() + 60 * 60 * 1000)}: {expires?: Date} = {},
) {
  const token = `e2e${randomUUID().replace(/-/g, '')}`;
  await db.verificationToken.create({
    data: {identifier: email, token, expires},
  });
  return token;
}

type WeeklyReportSeed = Partial<
  Omit<Prisma.WeeklyReportUncheckedCreateInput, 'userId' | 'weekStart'>
> & {weekStart: string};

/** A generated weekly report; JSON fields take plain values. */
export function seedWeeklyReport(
  db: PrismaClient,
  userId: string,
  {
    weekStart,
    sections = [{title: 'Nutrition', points: ['Seeded point']}],
    nextWeekFocus = [],
    lastWeekFocusResults = null,
    ...data
  }: Omit<WeeklyReportSeed, 'narrative' | 'nextWeekFocus' | 'lastWeekFocusResults'> & {
    sections?: unknown[];
    nextWeekFocus?: unknown[];
    lastWeekFocusResults?: unknown[] | null;
  },
) {
  const [year, month, day] = weekStart.split('-').map(Number);
  const weekEnd = new Date(Date.UTC(year, month - 1, day + 6)).toISOString().slice(0, 10);
  return db.weeklyReport.create({
    data: {
      weekStart,
      weekEnd,
      timeZone: 'UTC',
      calorieGoal: 2000,
      proteinGoal: 150,
      carbsGoal: 250,
      fatGoal: 70,
      saturatedFatGoal: 20,
      daysLogged: 7,
      avgCalories: 1900,
      avgProtein: 120,
      avgCarbs: 200,
      avgFat: 60,
      avgSaturatedFat: 18,
      calorieDaysOver: 1,
      proteinDaysHit: 2,
      satFatDaysOver: 3,
      healthAlertCount: 0,
      exercisesPlanned: 10,
      exercisesDone: 8,
      cardioMinutes: 90,
      strengthSessions: 3,
      exerciseCalories: 900,
      weighInCount: 2,
      weightAvg: 74.5,
      prevWeightAvg: 75,
      dailyBreakdown: '[]',
      topIssues: '[]',
      strengthProgress: '[]',
      headline: 'Seeded headline',
      model: 'mock-model',
      promptVersion: 1,
      ...data,
      narrative: JSON.stringify(sections),
      nextWeekFocus: JSON.stringify(nextWeekFocus),
      lastWeekFocusResults: lastWeekFocusResults && JSON.stringify(lastWeekFocusResults),
      userId,
    },
  });
}
