import {addDays, format, parseISO, subDays} from 'date-fns';
import {Prisma} from '@prisma/client';
import {
  EXERCISE_LOG_INCLUDE,
  countPlannedOn,
  daysToMask,
  inputSets,
  isActiveOn,
  normalizeNotes,
  setsOf,
  toPlanFields,
  type ExerciseGoalInput,
  type ExerciseSet,
} from '@/lib/exercise';
import {catalogIdFor} from '@/lib/exercise-catalog';
import {prisma} from '@/lib/prisma';
import {
  getDateRange,
  getTodayDate,
  getTodayWeekday,
  toZoned,
} from '@/lib/timezone';

type PlanGoal = {daysMask: number; createdAt: Date};

/** The goal is missing, or changed since the given `updatedAt`. */
export class ExerciseGoalNotFoundError extends Error {}

/**
 * Adds a planned exercise, or updates the one with `target.id`. With
 * `target.updatedAt`, only a goal unchanged since then is updated.
 */
export async function saveExerciseGoal(
  userId: string,
  timeZone: string,
  input: ExerciseGoalInput,
  target?: {id: string; updatedAt?: Date},
) {
  const data = {
    name: input.name,
    catalogId: catalogIdFor(input.name),
    calories: input.calories,
    notes: normalizeNotes(input.notes),
    daysMask: daysToMask(input.days),
    ...toPlanFields(inputSets(input)),
  };

  await freezePastPlanDays(userId, timeZone);

  if (!target) {
    return prisma.exerciseGoal.create({data: {...data, userId}});
  }
  const result = await prisma.exerciseGoal.updateMany({
    where: {id: target.id, userId, updatedAt: target.updatedAt},
    data,
  });
  if (result.count === 0) throw new ExerciseGoalNotFoundError();
  return prisma.exerciseGoal.findUniqueOrThrow({where: {id: target.id}});
}

/** Removes a planned exercise; with `updatedAt`, only if unchanged since then. */
export async function deleteExerciseGoal(
  userId: string,
  timeZone: string,
  id: string,
  updatedAt?: Date,
) {
  await freezePastPlanDays(userId, timeZone);
  const result = await prisma.exerciseGoal.deleteMany({
    where: {id, userId, updatedAt},
  });
  if (result.count === 0) throw new ExerciseGoalNotFoundError();
}

export async function getPlannedExerciseGoals(
  userId: string,
  timeZone: string,
) {
  const weekday = getTodayWeekday(timeZone);
  const goals = await prisma.exerciseGoal.findMany({
    where: {userId},
    orderBy: {createdAt: 'asc'},
  });
  return goals.filter((goal) => isActiveOn(goal.daysMask, weekday));
}

/** Each goal's sets as ticked off on this weekday last week, by goal id. */
export async function getLastWeekSets(
  userId: string,
  timeZone: string,
): Promise<Map<string, ExerciseSet[]>> {
  const lastWeek = format(
    subDays(parseISO(getTodayDate(timeZone)), 7),
    'yyyy-MM-dd',
  );
  const logs = await prisma.exerciseLog.findMany({
    where: {userId, goalDate: lastWeek, exerciseGoalId: {not: null}},
    include: EXERCISE_LOG_INCLUDE,
  });
  return new Map(
    logs.map((log) => [log.exerciseGoalId as string, setsOf(log)]),
  );
}

/**
 * Today's planned exercises as the log dialog takes them, each marked
 * completed when one of today's logs ticked it off.
 */
export async function getTodaysPlanStatus(
  userId: string,
  timeZone: string,
  todaysLogs: {exerciseGoalId: string | null}[],
) {
  const [goals, lastWeekSets] = await Promise.all([
    getPlannedExerciseGoals(userId, timeZone),
    getLastWeekSets(userId, timeZone),
  ]);
  return goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    type: goal.type,
    calories: goal.calories,
    durationMin: goal.durationMin,
    sets: goal.sets,
    reps: goal.reps,
    weight: goal.weight,
    setPlan: goal.setPlan,
    catalogId: goal.catalogId,
    tempoMs: goal.tempoMs,
    notes: goal.notes,
    lastWeekSets: lastWeekSets.get(goal.id) ?? null,
    completed: todaysLogs.some((log) => log.exerciseGoalId === goal.id),
  }));
}

function nextDate(date: string): string {
  return format(addDays(parseISO(date), 1), 'yyyy-MM-dd');
}

/** Planned count for a yyyy-MM-dd date, derived from the given goals. */
function countPlannedForDate(
  goals: readonly PlanGoal[],
  date: string,
  timeZone: string,
): number {
  const range = getDateRange(date, timeZone);
  if (!range) return 0;
  // parseISO keeps date-only keys at local midnight, so getDay() is the calendar weekday.
  return countPlannedOn(goals, parseISO(date).getDay(), range.end);
}

/**
 * Snapshots the planned count for every past day not yet frozen, so changing
 * goals afterwards doesn't rewrite history. Call before mutating goals.
 * Today stays live: editing the plan today changes today's plan.
 */
export async function freezePastPlanDays(userId: string, timeZone: string) {
  const [goals, latest] = await Promise.all([
    prisma.exerciseGoal.findMany({
      where: {userId},
      select: {daysMask: true, createdAt: true},
    }),
    prisma.exercisePlanDay.findFirst({
      where: {userId},
      orderBy: {date: 'desc'},
      select: {date: true},
    }),
  ]);

  let start: string;
  if (latest) {
    start = nextDate(latest.date);
  } else if (goals.length > 0) {
    const earliest = goals.reduce((min, goal) =>
      goal.createdAt < min.createdAt ? goal : min,
    );
    start = format(toZoned(earliest.createdAt, timeZone), 'yyyy-MM-dd');
  } else {
    return;
  }

  const today = getTodayDate(timeZone);
  const rows: Prisma.ExercisePlanDayCreateManyInput[] = [];
  for (let date = start; date < today; date = nextDate(date)) {
    rows.push({
      userId,
      date,
      plannedCount: countPlannedForDate(goals, date, timeZone),
    });
  }
  if (rows.length === 0) return;

  try {
    await prisma.exercisePlanDay.createMany({data: rows});
  } catch (error) {
    // A concurrent request froze the same days; its rows are equivalent.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error;
    }
  }
}

/** Planned exercise count per yyyy-MM-dd date: the frozen snapshot, else derived from current goals. */
export async function getPlannedCounts(
  userId: string,
  dates: readonly string[],
  timeZone: string,
): Promise<Map<string, number>> {
  const [goals, snapshots] = await Promise.all([
    prisma.exerciseGoal.findMany({
      where: {userId},
      select: {daysMask: true, createdAt: true},
    }),
    prisma.exercisePlanDay.findMany({
      where: {userId, date: {in: [...dates]}},
      select: {date: true, plannedCount: true},
    }),
  ]);
  const frozen = new Map(
    snapshots.map((snapshot) => [snapshot.date, snapshot.plannedCount]),
  );
  return new Map(
    dates.map((date) => [
      date,
      frozen.get(date) ?? countPlannedForDate(goals, date, timeZone),
    ]),
  );
}

/**
 * Renames planned exercises to the built-in ones they're linked to, all or
 * none: a goal changed since its `updatedAt` cancels every link.
 */
export async function linkExerciseGoals(
  userId: string,
  links: readonly {goalId: string; updatedAt: Date; name: string}[],
) {
  await prisma.$transaction(async (tx) => {
    for (const {goalId, updatedAt, name} of links) {
      const result = await tx.exerciseGoal.updateMany({
        where: {id: goalId, userId, updatedAt},
        data: {name, catalogId: catalogIdFor(name)},
      });
      if (result.count === 0) throw new ExerciseGoalNotFoundError();
    }
  });
}
