import {
  differenceInCalendarDays,
  format,
  parseISO,
  subDays,
  subWeeks,
} from 'date-fns';
import {
  findLatestBodyMetricLog,
  listBodyMetricsWithLogs,
} from '@/lib/data/body-metrics';
import {isUniqueViolation} from '@/lib/data/errors';
import {listExerciseGoals} from '@/lib/data/exercise-goals';
import {listExerciseLogs} from '@/lib/data/exercise-logs';
import {listFoodLogs} from '@/lib/data/food-logs';
import {findGoals} from '@/lib/data/goals';
import type {ExerciseLog, WeeklyReport} from '@/lib/data/types';
import {listWeightLogs} from '@/lib/data/weight-logs';
import {
  createWeeklyReport,
  findPreviousWeeklyReport,
  findWeeklyReport,
} from '@/lib/data/weekly-reports';
import {listActiveUsers} from '@/lib/data/users';
import {getDateRange, getTodayDate, toZoned} from '@/lib/timezone';
import {getPlannedCounts} from '@/lib/exercise-plan';
import {loadProfileSummary, type ProfileSummary} from '@/lib/profile';
import {ACTIVITY_LEVELS, BMR_FORMULA_LABELS, FITNESS_GOALS} from '@/lib/tdee';
import {
  WEEKLY_REPORT_PROMPT_VERSION,
  getAiModel,
  isAiEnabled,
  writeWeeklyReport,
  type WeeklyReportSection,
  type WeeklyReportText,
} from '@/lib/ai';
import {
  FOCUS_METRICS,
  computeDailyBreakdown,
  computeStrengthProgress,
  computeTopIssues,
  computeWeekMetrics,
  currentWeekStart,
  evaluateFocus,
  lastCompletedWeekStart,
  parseFocusProposals,
  computeBodyMetricSummaries,
  planAdherence,
  weekDates,
  type BodyMetricSummary,
  type DayBreakdown,
  type FocusItem,
  type FocusResult,
  type ReportExercise,
  type ReportGoals,
  type StrengthProgress,
  type TopIssue,
  type WeekInput,
  type WeekMetrics,
} from '@/lib/weekly-report-metrics';

/** Users who haven't opened the app for this long get no new reports. */
const INACTIVE_AFTER_DAYS = 30;
/** How far back to look for a previous load when reporting strength progress. */
const STRENGTH_LOOKBACK_WEEKS = 8;

const localDate = (date: Date, timeZone: string) =>
  format(toZoned(date, timeZone), 'yyyy-MM-dd');

export async function getReportGoals(userId: string) {
  const goal = await findGoals(userId);
  // Same defaults as the dashboard when a user has no Goal row.
  const goals: ReportGoals = {
    calorieGoal: goal?.calorieGoal ?? 2000,
    proteinGoal: goal?.proteinGoal ?? 150,
    carbsGoal: goal?.carbsGoal ?? 250,
    fatGoal: goal?.fatGoal ?? 70,
    saturatedFatGoal: goal?.saturatedFatGoal ?? 20,
  };
  return {goals, healthNotes: goal?.healthNotes?.trim() || null};
}

/** Loads the logs for consecutive user-local dates into report input; also used by chat tools. */
export async function loadWeekInput(
  userId: string,
  dates: string[],
  timeZone: string,
  goals: ReportGoals,
): Promise<{input: WeekInput; start: Date; end: Date; previousStart: Date}> {
  const start = getDateRange(dates[0], timeZone)!.start;
  const end = getDateRange(dates.at(-1)!, timeZone)!.end;
  const loggedAt = {gte: start, lte: end};
  const previousStart = getDateRange(
    format(subDays(parseISO(dates[0]), 7), 'yyyy-MM-dd'),
    timeZone,
  )!.start;

  const [food, exercise, weights, previousWeek, plannedCounts] = await Promise.all([
    listFoodLogs(userId, {loggedAt, order: 'asc'}),
    listExerciseLogs(userId, {loggedAt, order: 'asc'}),
    listWeightLogs(userId, {loggedAt, order: 'asc'}),
    listWeightLogs(userId, {loggedAt: {gte: previousStart, lt: start}, order: 'asc'}),
    getPlannedCounts(userId, dates, timeZone),
  ]);
  // With no weigh-ins last week, fall back to the latest one before it.
  const previousWeights = previousWeek.length
    ? previousWeek
    : await listWeightLogs(userId, {loggedAt: {lt: previousStart}, take: 1});
  const toReportWeight = (entry: {loggedAt: Date; weight: number}) => ({
    date: localDate(entry.loggedAt, timeZone),
    weight: entry.weight,
  });

  return {
    start,
    end,
    previousStart,
    input: {
      dates,
      goals,
      food: food.map((entry) => ({
        date: localDate(entry.loggedAt, timeZone),
        name: entry.name,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        saturatedFat: entry.saturatedFat,
        healthAlertLevel: entry.healthAlertLevel,
      })),
      exercise: exercise.map((entry) => toReportExercise(entry, timeZone)),
      weights: weights.map(toReportWeight),
      previousWeights: previousWeights.map(toReportWeight),
      plannedCounts,
    },
  };
}

function toReportExercise(
  entry: Omit<ExerciseLog, 'exerciseSets'>,
  timeZone: string,
): ReportExercise {
  return {
    date: localDate(entry.loggedAt, timeZone),
    name: entry.name,
    type: entry.type,
    durationMin: entry.durationMin,
    weight: entry.weight,
    exerciseGoalId: entry.exerciseGoalId,
    goalDate: entry.goalDate,
  };
}

/**
 * Week averages of the user's active body metrics, with the previous week (or
 * the latest earlier value) as the baseline, like weight.
 */
async function loadBodyMetrics(
  userId: string,
  previousStart: Date,
  start: Date,
  end: Date,
): Promise<BodyMetricSummary[]> {
  const metrics = await listBodyMetricsWithLogs(userId, {
    activeOnly: true,
    loggedAt: {gte: previousStart, lte: end},
    order: 'asc',
  });

  const withValues = await Promise.all(
    metrics.map(async ({logs, ...metric}) => {
      const values = logs.filter((log) => log.loggedAt >= start);
      const previous = logs.filter((log) => log.loggedAt < start);
      const previousValues = previous.length
        ? previous
        : await findLatestBodyMetricLog(metric.id, {lt: previousStart}).then(
            (log) => (log ? [log] : []),
          );
      return {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
        direction: metric.direction,
        decimals: metric.decimals,
        values: values.map((log) => log.value),
        previousValues: previousValues.map((log) => log.value),
      };
    }),
  );
  return computeBodyMetricSummaries(withValues);
}

async function loadStrengthProgress(
  userId: string,
  input: WeekInput,
  weekStartAt: Date,
  timeZone: string,
): Promise<StrengthProgress[]> {
  const [prior, goals] = await Promise.all([
    listExerciseLogs(userId, {
      weighted: true,
      loggedAt: {
        gte: subWeeks(weekStartAt, STRENGTH_LOOKBACK_WEEKS),
        lt: weekStartAt,
      },
      order: 'asc',
    }),
    listExerciseGoals(userId),
  ]);
  return computeStrengthProgress(
    input.exercise,
    prior.map((entry) => toReportExercise(entry, timeZone)),
    new Map(goals.map((goal) => [goal.id, goal.weight])),
  );
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** The stored metric columns of a report, for comparing against last week. */
function reportMetrics(report: WeeklyReport): WeekMetrics {
  return {
    daysLogged: report.daysLogged,
    avgCalories: report.avgCalories,
    avgProtein: report.avgProtein,
    avgCarbs: report.avgCarbs,
    avgFat: report.avgFat,
    avgSaturatedFat: report.avgSaturatedFat,
    calorieDaysOver: report.calorieDaysOver,
    proteinDaysHit: report.proteinDaysHit,
    satFatDaysOver: report.satFatDaysOver,
    healthAlertCount: report.healthAlertCount,
    exercisesPlanned: report.exercisesPlanned,
    exercisesDone: report.exercisesDone,
    cardioMinutes: report.cardioMinutes,
    strengthSessions: report.strengthSessions,
    weighInCount: report.weighInCount,
    weightAvg: report.weightAvg,
    prevWeightAvg: report.prevWeightAvg,
  };
}

export type GenerateResult = 'created' | 'exists' | 'no-data';

/** The user's profile as the AI sees it, with labels instead of keys. */
export type ReportProfile = {
  goal: string;
  goalDetail: string;
  sex: string;
  age: number;
  heightCm: number;
  weightKg: number;
  bodyFatPct: number | null;
  lifestyle: string;
  bmr: number;
  bmrFormula: string;
  /** Adaptive TDEE when there's enough data, otherwise the formula one. */
  maintenanceCalories: number;
  maintenanceSource: 'adaptive from logs' | 'formula estimate';
  formulaTdee: number;
  adaptiveTdee: number | null;
  suggestedCalories: number;
  suggestedProtein: number;
};

function toReportProfile(summary: ProfileSummary): ReportProfile {
  const {maintenance} = summary;
  return {
    goal: summary.goalLabel,
    goalDetail: FITNESS_GOALS[summary.goal].detail,
    sex: summary.sex,
    age: summary.age,
    heightCm: summary.heightCm,
    weightKg: summary.weightKg,
    bodyFatPct: summary.bodyFatPct,
    lifestyle: `${ACTIVITY_LEVELS[summary.activityLevel].label} (${ACTIVITY_LEVELS[summary.activityLevel].detail})`,
    bmr: maintenance.bmr,
    bmrFormula: BMR_FORMULA_LABELS[maintenance.bmrFormula],
    maintenanceCalories: maintenance.maintenance,
    maintenanceSource: maintenance.isEstimate
      ? 'formula estimate'
      : 'adaptive from logs',
    formulaTdee: maintenance.formulaTdee,
    adaptiveTdee: maintenance.adaptive?.tdee ?? null,
    suggestedCalories: summary.targets.calories,
    suggestedProtein: summary.targets.protein,
  };
}

/** Everything the AI sees when writing a report. */
export type WeeklyReportPrompt = {
  week: {start: string; end: string};
  goals: ReportGoals;
  healthNotes: string | null;
  metrics: WeekMetrics & {planAdherencePercent: number | null};
  days: DayBreakdown[];
  topIssues: TopIssue[];
  strengthProgress: StrengthProgress[];
  /** The user's own body measurements beyond weight. */
  bodyMetrics: BodyMetricSummary[];
  /** Profile, goal and maintenance calories; null without a profile. */
  profile: ReportProfile | null;
  previousWeek: {weekStart: string; weeksAgo: number; metrics: WeekMetrics} | null;
  previousFocusResults: FocusResult[] | null;
  focusMetrics: Record<string, {description: string; direction: string | null}>;
};

export type ReportWriter = {
  write: (prompt: WeeklyReportPrompt) => Promise<WeeklyReportText>;
  /** Stored on the report. */
  model: string;
};

/**
 * Builds and saves the report for one Monday-Sunday week. Skips weeks with no
 * food, exercise, weight or body metrics logged. Metrics and focus checks are computed here; the AI only writes
 * the text and proposes next week's focus. `writer` replaces the AI, e.g. for
 * seeding demo data.
 */
export async function generateWeeklyReport(
  userId: string,
  timeZone: string,
  weekStart: string,
  writer?: ReportWriter,
): Promise<GenerateResult> {
  const existing = await findWeeklyReport(userId, weekStart);
  if (existing) return 'exists';

  const dates = weekDates(weekStart);
  // Only an in-progress week (e.g. seeded demo data) has days still to come.
  const today = getTodayDate(timeZone);
  const elapsed = dates.filter((date) => date <= today);
  if (elapsed.length === 0) return 'no-data';
  const {goals, healthNotes} = await getReportGoals(userId);
  const {input, start, end, previousStart} = await loadWeekInput(
    userId,
    elapsed,
    timeZone,
    goals,
  );
  const [bodyMetrics, profile] = await Promise.all([
    loadBodyMetrics(userId, previousStart, start, end),
    loadProfileSummary(userId, timeZone, elapsed.at(-1)!),
  ]);
  // Nothing logged at all means the user wasn't active that week.
  if (
    input.food.length === 0 &&
    input.exercise.length === 0 &&
    input.weights.length === 0 &&
    bodyMetrics.every((metric) => metric.count === 0)
  ) {
    return 'no-data';
  }
  const metrics = computeWeekMetrics(input);

  const previous = await findPreviousWeeklyReport(userId, weekStart);
  const previousFocus = parseJson<FocusItem[]>(previous?.nextWeekFocus);
  const focusResults = previousFocus?.length
    ? evaluateFocus(
        previousFocus,
        metrics,
        input.food,
        parseJson<FocusResult[]>(previous?.lastWeekFocusResults),
      )
    : null;

  const dailyBreakdown = computeDailyBreakdown(input);
  const topIssues = computeTopIssues(input, metrics);
  const strengthProgress = await loadStrengthProgress(
    userId,
    input,
    start,
    timeZone,
  );

  const prompt: WeeklyReportPrompt = {
    week: {start: dates[0], end: dates[6]},
    goals,
    healthNotes,
    metrics: {...metrics, planAdherencePercent: planAdherence(metrics)},
    days: dailyBreakdown,
    topIssues,
    strengthProgress,
    bodyMetrics,
    profile: profile && toReportProfile(profile),
    previousWeek: previous
      ? {
          weekStart: previous.weekStart,
          weeksAgo: Math.round(
            differenceInCalendarDays(
              parseISO(weekStart),
              parseISO(previous.weekStart),
            ) / 7,
          ),
          metrics: reportMetrics(previous),
        }
      : null,
    previousFocusResults: focusResults,
    focusMetrics: Object.fromEntries(
      Object.entries(FOCUS_METRICS).map(([key, def]) => [
        key,
        {description: def.description, direction: def.direction},
      ]),
    ),
  };
  const text = writer
    ? await writer.write(prompt)
    : await writeWeeklyReport(prompt);
  const nextWeekFocus = parseFocusProposals(
    text.nextWeekFocus,
    metrics,
    input.food,
  );

  try {
    await createWeeklyReport({
        userId,
        weekStart: dates[0],
        weekEnd: dates[6],
        timeZone,
        previousReportId: previous?.id ?? null,
        ...goals,
        healthNotes,
        ...metrics,
        dailyBreakdown: JSON.stringify(dailyBreakdown),
        topIssues: JSON.stringify(topIssues),
        strengthProgress: JSON.stringify(strengthProgress),
        bodyMetrics: bodyMetrics.length ? JSON.stringify(bodyMetrics) : null,
        profile: profile ? JSON.stringify(profile) : null,
        goalSuggestions:
          profile && text.goalSuggestions?.length
            ? JSON.stringify(text.goalSuggestions)
            : null,
        lastWeekFocusResults: focusResults
          ? JSON.stringify(focusResults)
          : null,
        nextWeekFocus: JSON.stringify(nextWeekFocus),
        headline: text.headline,
        narrative: JSON.stringify(text.sections),
        model: writer?.model ?? getAiModel() ?? 'unknown',
        promptVersion: WEEKLY_REPORT_PROMPT_VERSION,
    });
  } catch (error) {
    // A concurrent run saved this week first.
    if (isUniqueViolation(error)) {
      return 'exists';
    }
    throw error;
  }
  return 'created';
}

/**
 * Generates last week's report for every active user whose local week has
 * ended. Safe to run often: existing reports are skipped.
 */
export async function generateDueWeeklyReports(now = new Date()) {
  if (!isAiEnabled()) return {created: 0, failed: 0};

  // No saved timezone means we can't tell when their week ends.
  const users = await listActiveUsers(subDays(now, INACTIVE_AFTER_DAYS));

  let created = 0;
  let failed = 0;
  // One at a time to stay gentle on the AI service.
  for (const user of users) {
    try {
      const weekStart = lastCompletedWeekStart(user.timeZone!, now);
      if (
        (await generateWeeklyReport(user.id, user.timeZone!, weekStart)) ===
        'created'
      ) {
        created++;
      }
    } catch (error) {
      failed++;
      console.error(`Weekly report failed for user ${user.id}`, error);
    }
  }
  return {created, failed};
}

// ---------------------------------------------------------------------------
// Reading reports
// ---------------------------------------------------------------------------

export type WeeklyReportView = {
  report: WeeklyReport;
  dailyBreakdown: DayBreakdown[];
  topIssues: TopIssue[];
  strengthProgress: StrengthProgress[];
  bodyMetrics: BodyMetricSummary[];
  /** Profile at generation time; null on reports without one. */
  profile: ProfileSummary | null;
  goalSuggestions: string[];
  lastWeekFocusResults: FocusResult[] | null;
  nextWeekFocus: FocusItem[];
  sections: WeeklyReportSection[];
};

export function toReportView(report: WeeklyReport): WeeklyReportView {
  return {
    report,
    dailyBreakdown: parseJson<DayBreakdown[]>(report.dailyBreakdown) ?? [],
    topIssues: parseJson<TopIssue[]>(report.topIssues) ?? [],
    strengthProgress:
      parseJson<StrengthProgress[]>(report.strengthProgress) ?? [],
    bodyMetrics: parseJson<BodyMetricSummary[]>(report.bodyMetrics) ?? [],
    profile: parseJson<ProfileSummary>(report.profile),
    goalSuggestions: parseJson<string[]>(report.goalSuggestions) ?? [],
    lastWeekFocusResults: parseJson<FocusResult[]>(report.lastWeekFocusResults),
    nextWeekFocus: parseJson<FocusItem[]>(report.nextWeekFocus) ?? [],
    sections: parseJson<WeeklyReportSection[]>(report.narrative) ?? [],
  };
}

export type FocusProgress = {
  /** The completed days of this week the results cover, oldest first. */
  days: string[];
  results: FocusResult[];
};

/**
 * Progress so far this week on a report's next-week focus, from Monday up to
 * yesterday: today is still being logged and would drag averages down. Null
 * on Monday, or unless the report covers the week just before this one.
 */
export async function getFocusProgress(
  userId: string,
  view: WeeklyReportView,
  timeZone: string,
  today: string,
): Promise<FocusProgress | null> {
  if (view.nextWeekFocus.length === 0) return null;
  if (view.report.weekStart !== lastCompletedWeekStart(timeZone)) return null;

  const days = weekDates(currentWeekStart(timeZone)).filter(
    (date) => date < today,
  );
  if (days.length === 0) return null;
  const {goals} = await getReportGoals(userId);
  const {input} = await loadWeekInput(userId, days, timeZone, goals);
  return {
    days,
    results: evaluateFocus(
      view.nextWeekFocus,
      computeWeekMetrics(input),
      input.food,
      null,
    ),
  };
}
