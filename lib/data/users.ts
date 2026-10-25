import {db} from '@/lib/db';
import {toPlain} from './plain';
import type {User} from './types';

export async function findUserById(id: string): Promise<User | null> {
  const {User} = await db();
  const doc = await User.findById(id).lean();
  return doc && toPlain(User, doc);
}

/** `email` must already be normalized. */
export async function findUserByEmail(email: string): Promise<User | null> {
  const {User} = await db();
  const doc = await User.findOne({email}).lean();
  return doc && toPlain(User, doc);
}

/** Creates the user with default nutrition goals. */
export async function createUserWithGoals(
  data: Pick<User, 'email' | 'name' | 'password'>,
): Promise<User> {
  const {User, Goal} = await db();
  const user = await User.create(data);
  // Without the row the app falls back to the same defaults, so a failure
  // here only loses the stored copy.
  await Goal.create({userId: user._id});
  return toPlain(User, user.toObject());
}

export async function updateUser(
  id: string,
  data: Partial<Pick<User, 'timeZone' | 'lastSeenAt'>>,
) {
  const {User} = await db();
  await User.updateOne({_id: id}, {$set: data});
}

/** `email` must already be normalized. */
export async function markEmailVerified(email: string) {
  const {User} = await db();
  await User.updateOne({email}, {$set: {emailVerified: new Date()}});
}

/** Deletes the user and everything they own. */
export async function deleteUserData(userId: string) {
  const models = await db();
  const [metrics, threads] = await Promise.all([
    models.BodyMetric.find({userId}, {_id: 1}).lean(),
    models.ChatThread.find({userId}, {_id: 1}).lean(),
  ]);
  await Promise.all([
    models.BodyMetricLog.deleteMany({metricId: {$in: metrics.map((metric) => metric._id)}}),
    models.ChatMessage.deleteMany({threadId: {$in: threads.map((thread) => thread._id)}}),
  ]);
  await Promise.all(
    [
      models.FoodLog,
      models.SavedFoodItem,
      models.ExerciseLog,
      models.SavedExerciseItem,
      models.ExerciseGoal,
      models.ExercisePlanDay,
      models.WeightLog,
      models.BodyMetric,
      models.Goal,
      models.Profile,
      models.WeeklyReport,
      models.ChatThread,
      models.ChatAction,
    ].map((model) => (model as typeof models.FoodLog).deleteMany({userId})),
  );
  await models.User.deleteOne({_id: userId});
}

/** Users with a saved timezone who visited since `since`. */
export async function listActiveUsers(
  since: Date,
): Promise<{id: string; timeZone: string}[]> {
  const {User} = await db();
  const docs = await User.find(
    {timeZone: {$ne: null}, lastSeenAt: {$gte: since}},
    {timeZone: 1},
  ).lean();
  return docs.map((doc) => ({id: doc._id, timeZone: doc.timeZone!}));
}
