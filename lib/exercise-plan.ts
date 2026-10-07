import {addDays, format, parseISO} from 'date-fns';
import {Prisma} from '@prisma/client';
import {countPlannedOn, isActiveOn} from '@/lib/exercise';
import {prisma} from '@/lib/prisma';
import {
  getDateRange,
  getTodayDate,
  getTodayWeekday,
  toZoned,
} from '@/lib/timezone';

type PlanGoal = {daysMask: number; createdAt: Date};

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
