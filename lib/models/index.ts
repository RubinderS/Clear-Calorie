// Mongoose schemas for every collection. Field comments live on the plain
// types in lib/data/types.ts, which these documents map to (see toPlain).
import mongoose, {Schema, type Connection, type Model} from 'mongoose';
import {nanoid} from 'nanoid';
import type * as T from '@/lib/data/types';

/** A record as stored: `_id` instead of `id`, sets without ids. */
export type Doc<R extends {id: string}> = Omit<R, 'id'> & {_id: string};

const id = {type: String, default: () => nanoid()};
const ref = {type: String, required: true};
// Optional fields default to null so reads match the plain types.
const optional = <V>(type: V) => ({type, default: null});
const now = {type: Date, default: () => new Date()};

/** Unique only among documents where every given field is a string, so nulls never collide. */
const whereStrings = (...fields: string[]) => ({
  partialFilterExpression: Object.fromEntries(
    fields.map((field) => [field, {$type: 'string'}]),
  ),
});

function schema<R extends {id: string}>(
  collection: string,
  fields: Record<string, unknown>,
  timestamps: boolean | {createdAt: boolean; updatedAt: boolean} = true,
) {
  return new Schema<Doc<R>>(
    {_id: id, ...fields},
    {collection, timestamps, versionKey: false, strict: true},
  );
}

const userSchema = schema<T.User>('users', {
  name: optional(String),
  email: {type: String, required: true},
  emailVerified: optional(Date),
  image: optional(String),
  password: optional(String),
  timeZone: optional(String),
  lastSeenAt: optional(Date),
});
userSchema.index({email: 1}, {unique: true});

const verificationTokenSchema = schema<T.VerificationToken>(
  'verification_tokens',
  {
    identifier: {type: String, required: true},
    token: {type: String, required: true},
    expires: {type: Date, required: true},
  },
  false,
);
verificationTokenSchema.index({token: 1}, {unique: true});
verificationTokenSchema.index({identifier: 1, token: 1}, {unique: true});
// MongoDB deletes tokens about a minute after they expire.
verificationTokenSchema.index({expires: 1}, {expireAfterSeconds: 0});

const nutrition = {
  name: {type: String, required: true},
  calories: {type: Number, required: true},
  protein: {type: Number, default: 0},
  carbs: {type: Number, default: 0},
  fat: {type: Number, default: 0},
  saturatedFat: {type: Number, default: 0},
};

const foodLogSchema = schema<T.FoodLog>('food_logs', {
  userId: ref,
  ...nutrition,
  healthAlertLevel: optional(String),
  healthAlertMessage: optional(String),
  loggedAt: now,
});
foodLogSchema.index({userId: 1, loggedAt: 1});

const savedFoodItemSchema = schema<T.SavedFoodItem>('saved_food_items', {
  userId: ref,
  ...nutrition,
  isPinned: {type: Boolean, default: false},
});
savedFoodItemSchema.index({userId: 1, name: 1}, {unique: true});

const exerciseSetSchema = new Schema<T.ExerciseSet>(
  {
    position: {type: Number, required: true},
    reps: optional(Number),
    durationSec: optional(Number),
    weight: optional(Number),
    name: optional(String),
    catalogId: optional(String),
  },
  {_id: false},
);

const exerciseSummary = {
  name: {type: String, required: true},
  type: {type: String, default: 'TIME'},
  sets: optional(Number),
  reps: optional(Number),
  weight: optional(Number),
  catalogId: optional(String),
};

const exerciseLogSchema = schema<T.ExerciseLog>('exercise_logs', {
  userId: ref,
  ...exerciseSummary,
  durationMin: {type: Number, default: 0},
  loggedAt: now,
  exerciseGoalId: optional(String),
  goalDate: optional(String),
  exerciseSets: {type: [exerciseSetSchema], default: []},
});
exerciseLogSchema.index({userId: 1, loggedAt: 1});
exerciseLogSchema.index(
  {exerciseGoalId: 1, goalDate: 1},
  {unique: true, ...whereStrings('exerciseGoalId', 'goalDate')},
);

const savedExerciseItemSchema = schema<T.SavedExerciseItem>('saved_exercise_items', {
  userId: ref,
  ...exerciseSummary,
  durationMin: {type: Number, default: 0},
  setPlan: optional(String),
  isPinned: {type: Boolean, default: false},
});
savedExerciseItemSchema.index({userId: 1, name: 1}, {unique: true});

const exerciseGoalSchema = schema<T.ExerciseGoal>('exercise_goals', {
  userId: ref,
  ...exerciseSummary,
  durationMin: optional(Number),
  setPlan: optional(String),
  tempoMs: optional(Number),
  notes: optional(String),
  steps: optional(String),
  daysMask: {type: Number, required: true},
});
exerciseGoalSchema.index({userId: 1});

const exercisePlanDaySchema = schema<T.ExercisePlanDay>(
  'exercise_plan_days',
  {
    userId: ref,
    date: {type: String, required: true},
    plannedCount: {type: Number, required: true},
  },
  false,
);
exercisePlanDaySchema.index({userId: 1, date: 1}, {unique: true});

const weightLogSchema = schema<T.WeightLog>('weight_logs', {
  userId: ref,
  weight: {type: Number, required: true},
  loggedAt: now,
});
weightLogSchema.index({userId: 1, loggedAt: 1});

const bodyMetricSchema = schema<T.BodyMetric>('body_metrics', {
  userId: ref,
  key: optional(String),
  label: {type: String, required: true},
  unit: {type: String, required: true},
  direction: {type: String, default: 'neutral'},
  decimals: {type: Number, default: 1},
  sortOrder: {type: Number, default: 0},
  archivedAt: optional(Date),
});
bodyMetricSchema.index({userId: 1, key: 1}, {unique: true, ...whereStrings('key')});

const bodyMetricLogSchema = schema<T.BodyMetricLog>(
  'body_metric_logs',
  {
    metricId: ref,
    value: {type: Number, required: true},
    loggedAt: now,
  },
  {createdAt: true, updatedAt: false},
);
bodyMetricLogSchema.index({metricId: 1, loggedAt: 1});

const goalSchema = schema<T.Goal>(
  'goals',
  {
    userId: ref,
    calorieGoal: {type: Number, default: 2000},
    proteinGoal: {type: Number, default: 150},
    carbsGoal: {type: Number, default: 250},
    fatGoal: {type: Number, default: 70},
    saturatedFatGoal: {type: Number, default: 20},
    healthNotes: optional(String),
  },
  false,
);
goalSchema.index({userId: 1}, {unique: true});

const profileSchema = schema<T.Profile>('profiles', {
  userId: ref,
  sex: {type: String, required: true},
  birthYear: {type: Number, required: true},
  heightCm: {type: Number, required: true},
  bodyFatPct: optional(Number),
  activityLevel: {type: String, required: true},
  goal: {type: String, required: true},
});
profileSchema.index({userId: 1}, {unique: true});

const weeklyReportSchema = schema<T.WeeklyReport>('weekly_reports', {
  userId: ref,
  weekStart: {type: String, required: true},
  weekEnd: {type: String, required: true},
  timeZone: {type: String, required: true},
  previousReportId: optional(String),
  calorieGoal: Number,
  proteinGoal: Number,
  carbsGoal: Number,
  fatGoal: Number,
  saturatedFatGoal: Number,
  healthNotes: optional(String),
  daysLogged: Number,
  avgCalories: Number,
  avgProtein: Number,
  avgCarbs: Number,
  avgFat: Number,
  avgSaturatedFat: Number,
  calorieDaysOver: Number,
  proteinDaysHit: Number,
  satFatDaysOver: Number,
  healthAlertCount: Number,
  exercisesPlanned: Number,
  exercisesDone: Number,
  cardioMinutes: Number,
  strengthSessions: Number,
  weighInCount: Number,
  weightAvg: optional(Number),
  prevWeightAvg: optional(Number),
  bodyMetrics: optional(String),
  profile: optional(String),
  dailyBreakdown: String,
  topIssues: String,
  strengthProgress: String,
  lastWeekFocusResults: optional(String),
  nextWeekFocus: String,
  headline: String,
  narrative: String,
  goalSuggestions: optional(String),
  model: String,
  promptVersion: Number,
  seenAt: optional(Date),
});
weeklyReportSchema.index({userId: 1, weekStart: 1}, {unique: true});
weeklyReportSchema.index(
  {previousReportId: 1},
  {unique: true, ...whereStrings('previousReportId')},
);

const chatThreadSchema = schema<T.ChatThread>('chat_threads', {
  userId: ref,
  title: {type: String, default: ''},
});
chatThreadSchema.index({userId: 1, updatedAt: -1});

const chatMessageSchema = schema<T.ChatMessage & {seq: number}>(
  'chat_messages',
  {
    threadId: ref,
    role: {type: String, required: true},
    content: optional(String),
    toolCalls: optional(String),
    toolCallId: optional(String),
    // Write order, so messages saved in the same millisecond replay in order.
    seq: {type: Number, required: true},
  },
  {createdAt: true, updatedAt: false},
);
chatMessageSchema.index({threadId: 1, createdAt: 1, seq: 1});

const chatActionSchema = schema<T.ChatAction>(
  'chat_actions',
  {
    threadId: ref,
    userId: ref,
    kind: {type: String, required: true},
    payload: {type: String, required: true},
    status: {type: String, default: 'pending'},
    resultId: optional(String),
    resolvedAt: optional(Date),
  },
  {createdAt: true, updatedAt: false},
);
chatActionSchema.index({threadId: 1, createdAt: 1});
chatActionSchema.index({userId: 1});

const SCHEMAS = {
  User: userSchema,
  VerificationToken: verificationTokenSchema,
  FoodLog: foodLogSchema,
  SavedFoodItem: savedFoodItemSchema,
  ExerciseLog: exerciseLogSchema,
  SavedExerciseItem: savedExerciseItemSchema,
  ExerciseGoal: exerciseGoalSchema,
  ExercisePlanDay: exercisePlanDaySchema,
  WeightLog: weightLogSchema,
  BodyMetric: bodyMetricSchema,
  BodyMetricLog: bodyMetricLogSchema,
  Goal: goalSchema,
  Profile: profileSchema,
  WeeklyReport: weeklyReportSchema,
  ChatThread: chatThreadSchema,
  ChatMessage: chatMessageSchema,
  ChatAction: chatActionSchema,
};

type Schemas = typeof SCHEMAS;
type DocOf<S> = S extends Schema<infer D> ? D : never;
export type Models = {[K in keyof Schemas]: Model<DocOf<Schemas[K]>>};

/** Every model, bound to `conn` (the app's default connection unless given). */
export function getModels(conn: Connection = mongoose.connection): Models {
  return Object.fromEntries(
    Object.entries(SCHEMAS).map(([name, schema]) => [
      name,
      conn.models[name] ?? conn.model(name, schema as Schema),
    ]),
  ) as Models;
}

/** Creates missing indexes and drops ones no schema declares. */
export async function syncIndexes(conn: Connection = mongoose.connection) {
  await Promise.all(Object.values(getModels(conn)).map((model) => model.syncIndexes()));
}
