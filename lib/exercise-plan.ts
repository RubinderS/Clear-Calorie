import {addDays, format, parseISO} from 'date-fns';
import {
  countPlannedOn,
  daysToMask,
  goalCatalogIds,
  inputSets,
  isActiveOn,
  isIdentityDayMap,
  normalizeNotes,
  scheduledWeekday,
  setsOf,
  shiftDateKey,
  swapInDayMap,
  toPlanFields,
  toSequenceFields,
  weekStartOf,
  weekdayOfDateKey,
  type DayMap,
  type ExerciseGoalInput,
  type ExerciseSet,
} from '@/lib/exercise';
import {dayFocus} from '@/lib/day-focus';
import {catalogIdFor} from '@/lib/exercise-catalog';
import type {Sides} from '@/lib/workout';
import * as goals from '@/lib/data/exercise-goals';
import {listGoalTicksBetween} from '@/lib/data/exercise-logs';
import {createPlanDays, findLatestPlanDay, listPlanDays} from '@/lib/data/plan-days';
import {
  deleteWeekSwap,
  findWeekSwap,
  listWeekSwaps,
  upsertWeekSwap,
} from '@/lib/data/week-swaps';
import {getDateRange, getTodayDate, toZoned} from '@/lib/timezone';

type PlanGoal = {daysMask: number; createdAt: Date};

/** The goal is missing, or changed since the given `updatedAt`. */
export class ExerciseGoalNotFoundError extends Error {}

/**
 * How a custom exercise's sides are kept: null for both together, and left as
 * they are when not given. A built-in exercise's come from its catalog entry.
 */
function storedSides(catalogId: string | null, sides: Sides | null | undefined) {
  if (catalogId) return null;
  if (sides === undefined) return undefined;
  return sides === 'both' ? null : sides;
}

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
  const catalogId = 'steps' in input ? null : catalogIdFor(input.name);
  const data = {
    name: input.name,
    notes: normalizeNotes(input.notes),
    daysMask: daysToMask(input.days),
    // A sequence's exercises and tempos are kept per step instead.
    ...('steps' in input
      ? {...toSequenceFields(input.steps), catalogId: null, tempoMs: null, sides: null}
      : {
          ...toPlanFields(inputSets(input)),
          catalogId,
          sides: storedSides(catalogId, input.sides),
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

/** Each week's day map, by week start, for the weeks the dates fall in. */
async function dayMapsFor(
  userId: string,
  dates: readonly string[],
): Promise<Map<string, DayMap>> {
  if (dates.length === 0) return new Map();
  const swaps = await listWeekSwaps(userId, dates.map(weekStartOf));
  return new Map(swaps.map((swap) => [swap.weekStart, swap.dayMap]));
}

/** The weekday whose workout is planned on a yyyy-MM-dd date, after that week's swaps. */
function plannedWeekdayOn(date: string, maps: Map<string, DayMap>): number {
  return scheduledWeekday(
    maps.get(weekStartOf(date)) ?? null,
    weekdayOfDateKey(date),
  );
}

/**
 * The goals planned today, or on an earlier yyyy-MM-dd `date` from the
 * current plan: those on its weekday (after that week's swaps) that existed by then.
 */
export async function getPlannedExerciseGoals(
  userId: string,
  timeZone: string,
  date?: string,
) {
  const day = date ?? getTodayDate(timeZone);
  const [all, maps] = await Promise.all([
    goals.listExerciseGoals(userId),
    dayMapsFor(userId, [day]),
  ]);
  const weekday = plannedWeekdayOn(day, maps);
  if (!date) {
    return all.filter((goal) => isActiveOn(goal.daysMask, weekday));
  }
  const range = getDateRange(date, timeZone);
  if (!range) return [];
  return all.filter(
    (goal) => isActiveOn(goal.daysMask, weekday) && goal.createdAt <= range.end,
  );
}

/**
 * Each goal's sets as last ticked off in the week before today, by goal id.
 * Not only from the same weekday, so swapped days still show last time's sets.
 */
export async function getLastWeekSets(
  userId: string,
  timeZone: string,
): Promise<Map<string, ExerciseSet[]>> {
  const today = getTodayDate(timeZone);
  const logs = await listGoalTicksBetween(userId, shiftDateKey(today, -7), today);
  const latest = new Map<string, {goalDate: string; sets: ExerciseSet[]}>();
  for (const log of logs) {
    const goalId = log.exerciseGoalId as string;
    const goalDate = log.goalDate as string;
    const seen = latest.get(goalId);
    if (!seen || goalDate > seen.goalDate) {
      latest.set(goalId, {goalDate, sets: setsOf(log)});
    }
  }
  return new Map([...latest].map(([goalId, {sets}]) => [goalId, sets]));
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
    sides: goal.sides,
    tempoMs: goal.tempoMs,
    notes: goal.notes,
    lastWeekSets: lastWeekSets.get(goal.id) ?? null,
    completed: todaysLogs.some((log) => log.exerciseGoalId === goal.id),
  }));
}

function nextDate(date: string): string {
  return format(addDays(parseISO(date), 1), 'yyyy-MM-dd');
}

/** Planned count for a yyyy-MM-dd date, derived from the given goals and week swaps. */
function countPlannedForDate(
  goals: readonly PlanGoal[],
  date: string,
  timeZone: string,
  maps: Map<string, DayMap>,
): number {
  const range = getDateRange(date, timeZone);
  if (!range) return 0;
  return countPlannedOn(goals, plannedWeekdayOn(date, maps), range.end);
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
  const dates: string[] = [];
  for (let date = start; date < today; date = nextDate(date)) dates.push(date);
  if (dates.length === 0) return;

  const maps = await dayMapsFor(userId, dates);
  const rows = dates.map((date) => ({
    userId,
    date,
    plannedCount: countPlannedForDate(plan, date, timeZone, maps),
  }));

  await createPlanDays(rows);
}

/** Planned exercise count per yyyy-MM-dd date: the frozen snapshot, else derived from current goals. */
export async function getPlannedCounts(
  userId: string,
  dates: readonly string[],
  timeZone: string,
): Promise<Map<string, number>> {
  const [plan, snapshots, maps] = await Promise.all([
    goals.listExerciseGoals(userId),
    listPlanDays(userId, dates),
    dayMapsFor(userId, dates),
  ]);
  const frozen = new Map(
    snapshots.map((snapshot) => [snapshot.date, snapshot.plannedCount]),
  );
  return new Map(
    dates.map((date) => [
      date,
      frozen.get(date) ?? countPlannedForDate(plan, date, timeZone, maps),
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

/** A day swap the rules don't allow; the message is shown to the user. */
export class DaySwapError extends Error {}

/** The yyyy-MM-dd date of a weekday (0 = Sunday) in the Monday-first week. */
function dateInWeek(weekStart: string, weekday: number): string {
  return shiftDateKey(weekStart, (weekday + 6) % 7);
}

/**
 * This week's swaps: its day map (null when none), and which weekdays can
 * still be swapped, being today or later with nothing ticked yet.
 */
export async function getWeekSwapState(userId: string, timeZone: string) {
  const today = getTodayDate(timeZone);
  const weekStart = weekStartOf(today);
  const [swap, ticks] = await Promise.all([
    findWeekSwap(userId, weekStart),
    listGoalTicksBetween(userId, today, shiftDateKey(weekStart, 7)),
  ]);
  const started = new Set(ticks.map((log) => log.goalDate));
  const swappable = [0, 1, 2, 3, 4, 5, 6].filter((weekday) => {
    const date = dateInWeek(weekStart, weekday);
    return date >= today && !started.has(date);
  });
  return {
    today,
    todayWeekday: weekdayOfDateKey(today),
    weekStart,
    dayMap: swap?.dayMap ?? null,
    swappable,
  };
}

async function saveDayMap(userId: string, timeZone: string, weekStart: string, map: number[]) {
  // Freeze history first, so earlier days keep the counts they had.
  await freezePastPlanDays(userId, timeZone);
  if (isIdentityDayMap(map)) {
    await deleteWeekSwap(userId, weekStart);
  } else {
    await upsertWeekSwap(userId, weekStart, map);
  }
}

/**
 * Trades the workouts of two weekdays for this week only; next week follows
 * the plan again. Both days must be today or later and not yet started.
 */
export async function swapWeekDays(
  userId: string,
  timeZone: string,
  a: number,
  b: number,
) {
  if (a === b) throw new DaySwapError('Pick two different days');
  const {today, weekStart, dayMap, swappable} = await getWeekSwapState(userId, timeZone);
  for (const day of [a, b]) {
    if (swappable.includes(day)) continue;
    throw new DaySwapError(
      dateInWeek(weekStart, day) < today
        ? "Days that have passed can't be swapped"
        : "You've already started this day's workout",
    );
  }
  await saveDayMap(userId, timeZone, weekStart, swapInDayMap(dayMap, a, b));
}

/**
 * Puts this week's swappable days back on their own workouts. A day swapped
 * with one that has passed or started keeps its swap.
 */
export async function resetWeekSwaps(userId: string, timeZone: string) {
  const {weekStart, dayMap, swappable} = await getWeekSwapState(userId, timeZone);
  if (!dayMap) return;
  let map = [...dayMap];
  for (const day of swappable) {
    if (map[day] === day) continue;
    // The day doing this day's workout gives it back.
    const holder = map.indexOf(day);
    if (swappable.includes(holder)) map = swapInDayMap(map, day, holder);
  }
  if (map.every((scheduled, day) => scheduled === dayMap[day])) return;
  await saveDayMap(userId, timeZone, weekStart, map);
}

/** One day of this week as the swap picker shows it. */
export type WeekSwapDay = {
  /** Real weekday, 0 = Sunday. */
  weekday: number;
  /** yyyy-MM-dd */
  date: string;
  /** The weekday whose workout is planned on it after swaps. */
  plannedWeekday: number;
  /** Names of the exercises planned on it. */
  exercises: string[];
  /** What the day works, e.g. "Leg day"; null when there's no clear focus. */
  focus: string | null;
  swappable: boolean;
};

/** This week, Monday first, with what each day is planned to do after swaps. */
export async function getWeekSwapOverview(userId: string, timeZone: string) {
  const [state, all] = await Promise.all([
    getWeekSwapState(userId, timeZone),
    goals.listExerciseGoals(userId),
  ]);
  const days: WeekSwapDay[] = [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const plannedWeekday = scheduledWeekday(state.dayMap, weekday);
    const dayGoals = all.filter((goal) => isActiveOn(goal.daysMask, plannedWeekday));
    return {
      weekday,
      date: dateInWeek(state.weekStart, weekday),
      plannedWeekday,
      exercises: dayGoals.map((goal) => goal.name),
      focus: dayFocus(dayGoals.map(goalCatalogIds)),
      swappable: state.swappable.includes(weekday),
    };
  });
  return {todayWeekday: state.todayWeekday, days};
}
