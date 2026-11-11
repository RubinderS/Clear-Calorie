// A small Prisma-style API over the app's Mongoose models, so specs read and
// seed the database the way they always have: db.foodLog.count({where}), etc.
// Supports what specs use: equality, `in` and `not` filters, top-level
// `select`, `orderBy`, and `exerciseSets` (embedded in exercise logs).
import mongoose, {type Connection, type Model} from 'mongoose';
import {getModels, syncIndexes, type Models} from '../../lib/models';
import {toPlain} from '../../lib/data/plain';
import type * as T from '../../lib/data/types';

type Where = Record<string, unknown>;
// Generic over every collection, so the strict per-schema filter types don't apply.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;
type OrderBy = Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
type Select = Record<string, unknown>;
type FindArgs = {where?: Where; select?: Select; include?: Select; orderBy?: OrderBy};

export type Delegate<R> = {
  count(args?: {where?: Where}): Promise<number>;
  findUnique(args: FindArgs): Promise<R | null>;
  findFirst(args?: FindArgs): Promise<R | null>;
  findUniqueOrThrow(args: FindArgs): Promise<R>;
  findFirstOrThrow(args?: FindArgs): Promise<R>;
  findMany(args?: FindArgs & {take?: number}): Promise<R[]>;
  create(args: {data: Record<string, unknown>}): Promise<R>;
  createMany(args: {data: Record<string, unknown>[]}): Promise<{count: number}>;
  update(args: {where: Where; data: Partial<R>}): Promise<R>;
  delete(args: {where: Where}): Promise<R>;
};

export type TestDb = {
  user: Delegate<T.User>;
  verificationToken: Delegate<T.VerificationToken>;
  foodLog: Delegate<T.FoodLog>;
  savedFoodItem: Delegate<T.SavedFoodItem>;
  exerciseLog: Delegate<T.ExerciseLog>;
  savedExerciseItem: Delegate<T.SavedExerciseItem>;
  exerciseGoal: Delegate<T.ExerciseGoal>;
  exercisePlanDay: Delegate<T.ExercisePlanDay>;
  weightLog: Delegate<T.WeightLog>;
  bodyMetric: Delegate<T.BodyMetric>;
  bodyMetricLog: Delegate<T.BodyMetricLog>;
  goal: Delegate<T.Goal>;
  profile: Delegate<T.Profile>;
  weeklyReport: Delegate<T.WeeklyReport>;
  chatThread: Delegate<T.ChatThread>;
  chatMessage: Delegate<T.ChatMessage>;
  chatAction: Delegate<T.ChatAction>;
  connection: Connection;
};

function toFilter(where: Where = {}) {
  const filter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    const field = key === 'id' ? '_id' : key;
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const {in: inList, not, ...rest} = value as {in?: unknown[]; not?: unknown};
      if (Object.keys(rest).length) {
        throw new Error(`test-db: unsupported filter on ${key}: ${JSON.stringify(value)}`);
      }
      filter[field] = inList ? {$in: inList} : {$ne: not};
    } else {
      filter[field] = value;
    }
  }
  return filter;
}

function toSort(orderBy?: OrderBy) {
  const entries = [orderBy ?? []].flat().flatMap((order) => Object.entries(order));
  return Object.fromEntries(entries.map(([key, dir]) => [key, dir === 'asc' ? 1 : -1] as const));
}

/** Applies a Prisma-style select, including `exerciseSets: {orderBy, select}`. */
function pick(record: Record<string, unknown>, args: FindArgs) {
  const sets = record.exerciseSets as Record<string, unknown>[] | undefined;
  const ordered = sets && [...sets].sort((a, b) => Number(a.position) - Number(b.position));
  if (!args.select) return ordered ? {...record, exerciseSets: ordered} : record;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(args.select)) {
    if (!spec) continue;
    if (key === 'exerciseSets' && ordered) {
      const fields = (spec as {select?: Select}).select;
      out[key] = fields
        ? ordered.map((set) =>
            Object.fromEntries(Object.keys(fields).map((field) => [field, set[field] ?? null])),
          )
        : ordered;
    } else {
      out[key] = record[key];
    }
  }
  return out;
}

function delegate<R>(model: AnyModel): Delegate<R> {
  const plain = (doc: object) => toPlain(model, doc as {_id: string}) as Record<string, unknown>;
  const findMany = async (args: FindArgs & {take?: number} = {}) => {
    const docs = await model
      .find(toFilter(args.where))
      .sort(toSort(args.orderBy))
      .limit(args.take ?? 0)
      .lean();
    return docs.map((doc) => pick(plain(doc), args) as R);
  };
  const findFirst = async (args: FindArgs = {}) => (await findMany({...args, take: 1}))[0] ?? null;
  const orThrow = async (args: FindArgs = {}) => {
    const found = await findFirst(args);
    if (!found) throw new Error(`test-db: no ${model.modelName} matches ${JSON.stringify(args.where)}`);
    return found;
  };
  const toDoc = ({id, ...data}: Record<string, unknown>) => (id ? {_id: id, ...data} : data);
  return {
    count: (args = {}) => model.countDocuments(toFilter(args.where)),
    findUnique: findFirst,
    findFirst,
    findUniqueOrThrow: orThrow,
    findFirstOrThrow: orThrow,
    findMany,
    async create({data}) {
      const doc = await model.create(toDoc(data));
      return plain(doc.toObject()) as R;
    },
    async createMany({data}) {
      const docs = await model.insertMany(data.map(toDoc));
      return {count: docs.length};
    },
    async update({where, data}) {
      const doc = await model
        .findOneAndUpdate(toFilter(where), {$set: data}, {returnDocument: 'after'})
        .orFail()
        .lean();
      return plain(doc) as R;
    },
    async delete({where}) {
      const doc = await model.findOneAndDelete(toFilter(where)).orFail().lean();
      return plain(doc) as R;
    },
  };
}

const NAMES: Record<Exclude<keyof TestDb, 'connection'>, keyof Models> = {
  user: 'User',
  verificationToken: 'VerificationToken',
  foodLog: 'FoodLog',
  savedFoodItem: 'SavedFoodItem',
  exerciseLog: 'ExerciseLog',
  savedExerciseItem: 'SavedExerciseItem',
  exerciseGoal: 'ExerciseGoal',
  exercisePlanDay: 'ExercisePlanDay',
  weightLog: 'WeightLog',
  bodyMetric: 'BodyMetric',
  bodyMetricLog: 'BodyMetricLog',
  goal: 'Goal',
  profile: 'Profile',
  weeklyReport: 'WeeklyReport',
  chatThread: 'ChatThread',
  chatMessage: 'ChatMessage',
  chatAction: 'ChatAction',
};

/** A TestDb on its own connection to `url`. */
export function createTestDb(url: string): TestDb {
  const connection = mongoose.createConnection(url, {autoIndex: false});
  const models = getModels(connection);
  const db = Object.fromEntries(
    Object.entries(NAMES).map(([key, name]) => [key, delegate(models[name] as AnyModel)]),
  );
  return {...db, connection} as TestDb;
}

/**
 * Empties a database, runs `migrate` (the data migrations) and builds the
 * indexes, in the order a fresh install does.
 */
export async function resetDatabase(url: string, migrate: () => Promise<unknown>) {
  const connection = await mongoose.createConnection(url, {autoIndex: false}).asPromise();
  try {
    await connection.dropDatabase();
    await migrate();
    await syncIndexes(connection);
  } finally {
    await connection.close();
  }
}
