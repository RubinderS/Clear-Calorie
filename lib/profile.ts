import {format, parseISO, subDays} from 'date-fns';
import {prisma} from '@/lib/prisma';
import {getDateRange, toZoned} from '@/lib/timezone';
import {
  ADAPTIVE_LOOKBACK_DAYS,
  FITNESS_GOALS,
  ageFromBirthYear,
  buildDailyLogs,
  calculateMaintenance,
  goalTargets,
  isActivityLevel,
  isFitnessGoal,
  isSex,
  type ActivityLevel,
  type FitnessGoal,
  type GoalTargets,
  type Maintenance,
  type Sex,
} from '@/lib/tdee';

/** A profile with its maintenance calories, as shown and stored on reports. */
export type ProfileSummary = {
  goal: FitnessGoal;
  goalLabel: string;
  sex: Sex;
  age: number;
  heightCm: number;
  /** Latest weigh-in as of `weightAsOf`. */
  weightKg: number;
  bodyFatPct: number | null;
  activityLevel: ActivityLevel;
  maintenance: Maintenance;
  /** Suggested daily intake for the goal. */
  targets: GoalTargets;
};

const localDate = (date: Date, timeZone: string) =>
  format(toZoned(date, timeZone), 'yyyy-MM-dd');

/**
 * The user's profile and maintenance calories, with the adaptive TDEE from the
 * logs up to `endDate` (user-local yyyy-MM-dd, inclusive). Pass yesterday
 * rather than today: today's food is still being logged. Weight is the latest
 * weigh-in up to `weightAsOf`, by default the end of `endDate`. Null without a
 * valid profile or any weigh-in.
 */
export async function loadProfileSummary(
  userId: string,
  timeZone: string,
  endDate: string,
  weightAsOf?: Date,
): Promise<ProfileSummary | null> {
  const profile = await prisma.profile.findUnique({where: {userId}});
  if (
    !profile ||
    !isSex(profile.sex) ||
    !isActivityLevel(profile.activityLevel) ||
    !isFitnessGoal(profile.goal)
  ) {
    return null;
  }

  const end = getDateRange(endDate, timeZone)!.end;
  const start = getDateRange(
    format(subDays(parseISO(endDate), ADAPTIVE_LOOKBACK_DAYS - 1), 'yyyy-MM-dd'),
    timeZone,
  )!.start;
  const loggedAt = {gte: start, lte: end};
  const [latestWeight, food, weights] = await Promise.all([
    prisma.weightLog.findFirst({
      where: {userId, loggedAt: {lte: weightAsOf ?? end}},
      orderBy: {loggedAt: 'desc'},
      select: {weight: true},
    }),
    prisma.foodLog.findMany({
      where: {userId, loggedAt},
      select: {loggedAt: true, calories: true},
    }),
    prisma.weightLog.findMany({
      where: {userId, loggedAt},
      select: {loggedAt: true, weight: true},
    }),
  ]);
  if (!latestWeight) return null;

  const stats = {
    sex: profile.sex,
    age: ageFromBirthYear(profile.birthYear, Number(endDate.slice(0, 4))),
    heightCm: profile.heightCm,
    weightKg: latestWeight.weight,
    bodyFatPct: profile.bodyFatPct,
    activityLevel: profile.activityLevel,
  };
  const maintenance = calculateMaintenance(
    stats,
    buildDailyLogs(
      food.map((entry) => ({
        date: localDate(entry.loggedAt, timeZone),
        calories: entry.calories,
      })),
      weights.map((entry) => ({
        date: localDate(entry.loggedAt, timeZone),
        weight: entry.weight,
      })),
    ),
  );

  return {
    ...stats,
    goal: profile.goal,
    goalLabel: FITNESS_GOALS[profile.goal].label,
    maintenance,
    targets: goalTargets(
      profile.goal,
      maintenance.maintenance,
      stats.weightKg,
      stats.sex,
    ),
  };
}
