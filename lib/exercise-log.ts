import {z} from 'zod';
import {
  exerciseInputSchema,
  exerciseSetsSchema,
  inputSets,
  isSameExerciseName,
  isSequence,
  setsOf,
  toExerciseFields,
  toSetRows,
} from '@/lib/exercise';
import {catalogIdFor} from '@/lib/exercise-catalog';
import {ExerciseGoalNotFoundError, getPlannedExerciseGoals} from '@/lib/exercise-plan';
import {getTodayDate} from '@/lib/timezone';
import {isUniqueViolation} from '@/lib/data/errors';
import * as exerciseLogs from '@/lib/data/exercise-logs';

export const exerciseLogSchema = z
  .object({
    name: z.string().trim().min(1),
  })
  .and(exerciseInputSchema);

export type ExerciseLogInput = z.infer<typeof exerciseLogSchema>;

/** Thrown when the exercise should be ticked off in the day's plan instead. */
export class PlannedExerciseError extends Error {}

/** An earlier day an entry is logged on, instead of now. */
export type PastDay = {date: string; loggedAt: Date};

/** Logs an exercise that wasn't planned, now or on an earlier `day`. */
export async function createExerciseLog(
  userId: string,
  timeZone: string,
  input: ExerciseLogInput,
  day?: PastDay,
) {
  const {name} = input;

  // Once a planned exercise is ticked off that day, more of it is an extra.
  const date = day?.date ?? getTodayDate(timeZone);
  const [planned, ticks] = await Promise.all([
    getPlannedExerciseGoals(userId, timeZone, day?.date),
    exerciseLogs.listExerciseLogs(userId, {goalDate: date, planned: true}),
  ]);
  const ticked = new Set(ticks.map((log) => log.exerciseGoalId));
  if (
    planned.some(
      (goal) => !ticked.has(goal.id) && isSameExerciseName(goal.name, name),
    )
  ) {
    throw new PlannedExerciseError(
      day
        ? `"${name}" was planned that day. Ask the coach to tick it off for that day instead.`
        : `"${name}" is in today's plan. Tick it off there instead.`,
    );
  }

  const sets = inputSets(input);
  const fields = toExerciseFields(sets);
  return exerciseLogs.createExerciseLog({
    name,
    catalogId: catalogIdFor(name),
    ...fields,
    durationMin: fields.durationMin ?? 0,
    userId,
    exerciseSets: toSetRows(sets),
    loggedAt: day?.loggedAt,
  });
}

/** A planned exercise ticked off on an earlier day, as done then. */
export const plannedTickSchema = z.object({
  goalId: z.string().min(1),
  name: z.string().trim().min(1),
  exerciseSets: exerciseSetsSchema,
});

export type PlannedTick = z.infer<typeof plannedTickSchema>;

/** Thrown when the planned exercise was already ticked off that day. */
export class AlreadyTickedError extends Error {}

/**
 * Ticks off a planned exercise on an earlier day with the sets done. The goal
 * must still exist and have been planned that day.
 */
export async function logPastPlannedExercise(
  userId: string,
  timeZone: string,
  tick: PlannedTick,
  day: PastDay,
) {
  const planned = await getPlannedExerciseGoals(userId, timeZone, day.date);
  const goal = planned.find(({id}) => id === tick.goalId);
  if (!goal) throw new ExerciseGoalNotFoundError();

  // A sequence's sets are labelled from its steps.
  const steps = setsOf(goal);
  const sets = tick.exerciseSets.map((set, index) =>
    isSequence(goal)
      ? {...set, name: steps[index]?.name ?? null, catalogId: steps[index]?.catalogId ?? null}
      : set,
  );
  const fields = toExerciseFields(sets);
  try {
    return await exerciseLogs.createExerciseLog({
      userId,
      exerciseGoalId: goal.id,
      goalDate: day.date,
      name: goal.name,
      catalogId: goal.catalogId,
      ...fields,
      durationMin: fields.durationMin ?? 0,
      exerciseSets: toSetRows(sets),
      loggedAt: day.loggedAt,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AlreadyTickedError();
    throw error;
  }
}
