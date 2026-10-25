import {addDays, format, parseISO, subDays} from 'date-fns';
import {
  countPlannedOn,
  daysToMask,
  inputSets,
  isActiveOn,
  normalizeNotes,
  setsOf,
  toPlanFields,
  toSequenceFields,
  type ExerciseGoalInput,
  type ExerciseSet,
} from '@/lib/exercise';
import {catalogIdFor} from '@/lib/exercise-catalog';
import * as goals from '@/lib/data/exercise-goals';
import {listExerciseLogs} from '@/lib/data/exercise-logs';
import {createPlanDays, findLatestPlanDay, listPlanDays} from '@/lib/data/plan-days';
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
    notes: normalizeNotes(input.notes),
    daysMask: daysToMask(input.days),
    // A sequence's exercises and tempos are kept per step instead.
    ...('steps' in input
      ? {...toSequenceFields(input.steps), catalogId: null, tempoMs: null}
      : {
          ...toPlanFields(inputSets(input)),
          catalogId: catalogIdFor(input.name),
          steps: null,
        }),
  };

  await freezePastPlanDays(userId, timeZone);

  if (!target) {
    return goals.createExerciseGoal(userId, data);
  }
  const goal = await goals.updateExerciseGoal(
    userId,
    target.id,
    data,
    target.updatedAt,
  );
  if (!goal) throw new ExerciseGoalNotFoundError();
  return goal;
}

/** Removes a planned exercise; with `updatedAt`, only if unchanged since then. */
export async function deleteExerciseGoal(
  userId: string,
  timeZone: string,
  id: string,
  updatedAt?: Date,
) {
  await freezePastPlanDays(userId, timeZone);
  if (!(await goals.deleteExerciseGoal(userId, id, updatedAt))) {
    throw new ExerciseGoalNotFoundError();
  }
}

export async function getPlannedExerciseGoals(
  userId: string,
  timeZone: string,
) {
  const weekday = getTodayWeekday(timeZone);
  const all = await goals.listExerciseGoals(userId);
  return all.filter((goal) => isActiveOn(goal.daysMask, weekday));
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
  const logs = await listExerciseLogs(userId, {goalDate: lastWeek, planned: true});
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
    durationMin: goal.durationMin,
    sets: goal.sets,
    reps: goal.reps,
    weight: goal.weight,
    setPlan: goal.setPlan,
    steps: goal.steps,
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
  const [plan, latest] = await Promise.all([
    goals.listExerciseGoals(userId),
    findLatestPlanDay(userId),
  ]);

  let start: string;
  if (latest) {
    start = nextDate(latest.date);
  } else if (plan.length > 0) {
    const earliest = plan.reduce((min, goal) =>
      goal.createdAt < min.createdAt ? goal : min,
    );
    start = format(toZoned(earliest.createdAt, timeZone), 'yyyy-MM-dd');
  } else {
    return;
  }

  const today = getTodayDate(timeZone);
  const rows: {userId: string; date: string; plannedCount: number}[] = [];
  for (let date = start; date < today; date = nextDate(date)) {
    rows.push({
      userId,
      date,
      plannedCount: countPlannedForDate(plan, date, timeZone),
    });
  }
  if (rows.length === 0) return;

  await createPlanDays(rows);
}

/** Planned exercise count per yyyy-MM-dd date: the frozen snapshot, else derived from current goals. */
export async function getPlannedCounts(
  userId: string,
  dates: readonly string[],
  timeZone: string,
): Promise<Map<string, number>> {
  const [plan, snapshots] = await Promise.all([
    goals.listExerciseGoals(userId),
    listPlanDays(userId, dates),
  ]);
  const frozen = new Map(
    snapshots.map((snapshot) => [snapshot.date, snapshot.plannedCount]),
  );
  return new Map(
    dates.map((date) => [
      date,
      frozen.get(date) ?? countPlannedForDate(plan, date, timeZone),
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
  const renamed = await goals.renameExerciseGoals(
    userId,
    links.map(({goalId, updatedAt, name}) => ({
      id: goalId,
      updatedAt,
      name,
      catalogId: catalogIdFor(name),
    })),
  );
  if (!renamed) throw new ExerciseGoalNotFoundError();
}
