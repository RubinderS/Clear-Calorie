import {db} from '@/lib/db';
import {direction, inRange, where, type DateRange, type SortOrder} from './common';
import {toPlain} from './plain';
import type {Doc} from '@/lib/models';
import type {ExerciseLog, ExerciseLogWithDetails, ExerciseSet} from './types';

/** Summary columns, derived from the sets by toExerciseFields. */
export type ExerciseLogFields = Pick<
  ExerciseLog,
  'type' | 'durationMin' | 'sets' | 'reps' | 'weight'
>;

export type NewExerciseLog = ExerciseLogFields &
  Pick<ExerciseLog, 'userId' | 'name' | 'catalogId'> &
  Partial<Pick<ExerciseLog, 'exerciseGoalId' | 'goalDate'>> & {
    exerciseSets: ExerciseSet[];
  };

/** Adds each log's sets as shown (in order, without positions) and its goal's notes. */
async function withDetails(docs: Doc<ExerciseLog>[]): Promise<ExerciseLogWithDetails[]> {
  const {ExerciseLog, ExerciseGoal} = await db();
  const goalIds = [...new Set(docs.flatMap((doc) => doc.exerciseGoalId ?? []))];
  const goals = goalIds.length
    ? await ExerciseGoal.find({_id: {$in: goalIds}}, {notes: 1}).lean()
    : [];
  const notes = new Map(goals.map((goal) => [goal._id, goal.notes ?? null]));
  return docs.map((doc) => {
    const {exerciseSets, ...log} = toPlain(ExerciseLog, doc);
    return {
      ...log,
      exerciseGoal:
        log.exerciseGoalId && notes.has(log.exerciseGoalId)
          ? {notes: notes.get(log.exerciseGoalId)!}
          : null,
      exerciseSets: [...(exerciseSets ?? [])]
        .sort((a, b) => a.position - b.position)
        .map(({reps = null, durationSec = null, weight = null, name = null, catalogId = null}) => ({
          reps,
          durationSec,
          weight,
          name,
          catalogId,
        })),
    };
  });
}

async function withDetailsOne(doc: Doc<ExerciseLog> | null) {
  return doc ? (await withDetails([doc]))[0] : null;
}

/** Throws a unique violation when the goal is already ticked for goalDate. */
export async function createExerciseLog(data: NewExerciseLog): Promise<ExerciseLogWithDetails> {
  const {ExerciseLog} = await db();
  const doc = await ExerciseLog.create(data);
  return (await withDetailsOne(doc.toObject()))!;
}

export async function listExerciseLogs(
  userId: string,
  {
    loggedAt,
    goalDate,
    planned,
    weighted,
    order = 'desc',
    take,
  }: {
    loggedAt?: DateRange;
    goalDate?: string;
    /** Only entries ticked off from a planned goal. */
    planned?: boolean;
    /** Only entries with a weight. */
    weighted?: boolean;
    order?: SortOrder;
    take?: number;
  } = {},
): Promise<ExerciseLogWithDetails[]> {
  const {ExerciseLog} = await db();
  const docs = await ExerciseLog.find(
    where({
      userId,
      loggedAt: inRange(loggedAt),
      goalDate,
      exerciseGoalId: planned ? {$ne: null} : undefined,
      weight: weighted ? {$ne: null} : undefined,
    }),
  )
    .sort({loggedAt: direction(order)})
    .limit(take ?? 0)
    .lean();
  return withDetails(docs);
}

export async function findExerciseLog(
  userId: string,
  id: string,
): Promise<ExerciseLogWithDetails | null> {
  const {ExerciseLog} = await db();
  return withDetailsOne(await ExerciseLog.findOne({_id: id, userId}).lean());
}

/** The entry a planned goal was ticked off with on goalDate. */
export async function findGoalTick(
  exerciseGoalId: string,
  goalDate: string,
): Promise<ExerciseLogWithDetails | null> {
  const {ExerciseLog} = await db();
  return withDetailsOne(await ExerciseLog.findOne({exerciseGoalId, goalDate}).lean());
}

/** Replaces the summary columns and every set. */
export async function updateExerciseLog(
  id: string,
  fields: ExerciseLogFields,
  exerciseSets: ExerciseSet[],
): Promise<ExerciseLogWithDetails> {
  const {ExerciseLog} = await db();
  const doc = await ExerciseLog.findByIdAndUpdate(
    id,
    {$set: {...fields, exerciseSets}},
    {returnDocument: 'after'},
  )
    .orFail()
    .lean();
  return (await withDetailsOne(doc))!;
}

/** False when the entry doesn't exist or belongs to someone else. */
export async function deleteExerciseLog(userId: string, id: string) {
  const {ExerciseLog} = await db();
  const result = await ExerciseLog.deleteOne({_id: id, userId});
  return result.deletedCount > 0;
}

/** Unticks a planned goal for goalDate; false when it wasn't ticked. */
export async function deleteGoalTick(
  userId: string,
  exerciseGoalId: string,
  goalDate: string,
) {
  const {ExerciseLog} = await db();
  const result = await ExerciseLog.deleteOne({userId, exerciseGoalId, goalDate});
  return result.deletedCount > 0;
}
