// Pure calculations behind the weekly report: week boundaries, metrics, top
// issues and focus-item checks. No database or AI access, so it is unit tested.
import {addDays, format, parseISO, startOfWeek, subWeeks} from 'date-fns';
import {TZDate} from '@date-fns/tz';
import {z} from 'zod';
import {averageNumbers, roundNumber, sumNumbers} from '@/lib/decimal';

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

/** Monday (yyyy-MM-dd) of the week before the one containing `now` in the timezone. */
export function lastCompletedWeekStart(timeZone: string, now = new Date()): string {
  const local = new TZDate(now, timeZone);
  return format(subWeeks(startOfWeek(local, {weekStartsOn: 1}), 1), 'yyyy-MM-dd');
}

/** Monday (yyyy-MM-dd) of the week containing `now` in the timezone. */
export function currentWeekStart(timeZone: string, now = new Date()): string {
  return format(startOfWeek(new TZDate(now, timeZone), {weekStartsOn: 1}), 'yyyy-MM-dd');
}

/** The 7 yyyy-MM-dd dates from a Monday. */
export function weekDates(weekStart: string): string[] {
  // parseISO keeps date-only keys at local midnight, so day arithmetic stays on the calendar.
  const monday = parseISO(weekStart);
  return Array.from({length: 7}, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'));
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type ReportGoals = {
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  saturatedFatGoal: number;
};

/** Log entries carry their user-local yyyy-MM-dd `date`. */
export type ReportFood = {
  date: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  healthAlertLevel: string | null;
};

export type ReportExercise = {
  date: string;
  name: string;
  type: string;
  calories: number;
  durationMin: number;
  weight: number | null;
  exerciseGoalId: string | null;
  goalDate: string | null;
};

export type ReportWeight = {date: string; weight: number};

export type WeekInput = {
  dates: string[];
  goals: ReportGoals;
  food: ReportFood[];
  exercise: ReportExercise[];
  /** Oldest first. */
  weights: ReportWeight[];
  /** The previous week's weigh-ins, or the latest earlier one if it had none. */
  previousWeights: ReportWeight[];
  plannedCounts: ReadonlyMap<string, number>;
};

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export type WeekMetrics = {
  daysLogged: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgSaturatedFat: number;
  calorieDaysOver: number;
  proteinDaysHit: number;
  satFatDaysOver: number;
  healthAlertCount: number;
  exercisesPlanned: number;
  exercisesDone: number;
  cardioMinutes: number;
  strengthSessions: number;
  exerciseCalories: number;
  weighInCount: number;
  /** Average of this week's weigh-ins; null when there were none. */
  weightAvg: number | null;
  /** Average of `previousWeights`, the baseline for the weekly change. */
  prevWeightAvg: number | null;
};

export type DayBreakdown = {
  date: string;
  foodLogged: boolean;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  exerciseCalories: number;
  exercisesPlanned: number;
  exercisesDone: number;
};

/** A day counts as over on calories when it is more than this far above goal. */
const CALORIE_OVER_TOLERANCE = 1.05;

export const round1 = (value: number) => roundNumber(value, 1);

export function computeDailyBreakdown(input: WeekInput): DayBreakdown[] {
  return input.dates.map((date) => {
    const food = input.food.filter((entry) => entry.date === date);
    const exercise = input.exercise.filter((entry) => entry.date === date);
    return {
      date,
      foodLogged: food.length > 0,
      calories: round1(sumNumbers(food.map((entry) => entry.calories))),
      protein: round1(sumNumbers(food.map((entry) => entry.protein))),
      carbs: round1(sumNumbers(food.map((entry) => entry.carbs))),
      fat: round1(sumNumbers(food.map((entry) => entry.fat))),
      saturatedFat: round1(sumNumbers(food.map((entry) => entry.saturatedFat))),
      exerciseCalories: sumNumbers(exercise.map((entry) => entry.calories)),
      exercisesPlanned: input.plannedCounts.get(date) ?? 0,
      // Ticked goals keep goalDate even if the goal is later deleted.
      exercisesDone: input.exercise.filter((entry) => entry.goalDate === date).length,
    };
  });
}

function average(values: number[]): number {
  return round1(averageNumbers(values) ?? 0);
}

function averageWeight(weights: ReportWeight[]): number | null {
  return weights.length === 0 ? null : average(weights.map((entry) => entry.weight));
}

export function computeWeekMetrics(input: WeekInput): WeekMetrics {
  const days = computeDailyBreakdown(input);
  const logged = days.filter((day) => day.foodLogged);
  const {goals} = input;

  return {
    daysLogged: logged.length,
    avgCalories: average(logged.map((day) => day.calories)),
    avgProtein: average(logged.map((day) => day.protein)),
    avgCarbs: average(logged.map((day) => day.carbs)),
    avgFat: average(logged.map((day) => day.fat)),
    avgSaturatedFat: average(logged.map((day) => day.saturatedFat)),
    calorieDaysOver: logged.filter(
      (day) => day.calories > goals.calorieGoal * CALORIE_OVER_TOLERANCE,
    ).length,
    proteinDaysHit: logged.filter((day) => day.protein >= goals.proteinGoal).length,
    satFatDaysOver: logged.filter((day) => day.saturatedFat > goals.saturatedFatGoal)
      .length,
    healthAlertCount: input.food.filter((entry) => entry.healthAlertLevel).length,
    exercisesPlanned: sumNumbers(days.map((day) => day.exercisesPlanned)),
    exercisesDone: sumNumbers(days.map((day) => day.exercisesDone)),
    cardioMinutes: sumNumbers(
      input.exercise
        .filter((entry) => entry.type === 'TIME')
        .map((entry) => entry.durationMin),
    ),
    strengthSessions: new Set(
      input.exercise
        .filter((entry) => entry.type === 'STRENGTH')
        .map((entry) => entry.date),
    ).size,
    exerciseCalories: sumNumbers(days.map((day) => day.exerciseCalories)),
    weighInCount: input.weights.length,
    weightAvg: averageWeight(input.weights),
    prevWeightAvg: averageWeight(input.previousWeights),
  };
}

/** Planned exercises done as a whole percent; null when nothing was planned. */
export function planAdherence(metrics: WeekMetrics): number | null {
  if (metrics.exercisesPlanned === 0) return null;
  return Math.round(
    (Math.min(metrics.exercisesDone, metrics.exercisesPlanned) /
      metrics.exercisesPlanned) *
      100,
  );
}

// ---------------------------------------------------------------------------
// Top issues: which foods drove a nutrient over goal
// ---------------------------------------------------------------------------

type LimitNutrient = 'calories' | 'fat' | 'saturatedFat' | 'carbs';

export type TopIssue = {
  nutrient: LimitNutrient;
  avgPerDay: number;
  goal: number;
  /** Largest contributors, by summed amount across same-named entries. */
  sources: {name: string; entries: number; amount: number; share: number}[];
};

const MAX_SOURCES = 5;

export function computeTopIssues(input: WeekInput, metrics: WeekMetrics): TopIssue[] {
  if (metrics.daysLogged === 0) return [];
  const {goals} = input;
  const checks: {nutrient: LimitNutrient; avg: number; goal: number; over: boolean}[] = [
    {
      nutrient: 'saturatedFat',
      avg: metrics.avgSaturatedFat,
      goal: goals.saturatedFatGoal,
      over: metrics.avgSaturatedFat > goals.saturatedFatGoal,
    },
    {
      nutrient: 'fat',
      avg: metrics.avgFat,
      goal: goals.fatGoal,
      over: metrics.avgFat > goals.fatGoal,
    },
    {
      nutrient: 'calories',
      avg: metrics.avgCalories,
      goal: goals.calorieGoal,
      over: metrics.avgCalories > goals.calorieGoal * CALORIE_OVER_TOLERANCE,
    },
    {
      nutrient: 'carbs',
      avg: metrics.avgCarbs,
      goal: goals.carbsGoal,
      over: metrics.avgCarbs > goals.carbsGoal * CALORIE_OVER_TOLERANCE,
    },
  ];

  return checks
    .filter((check) => check.over)
    .map((check) => {
      const total = sumNumbers(input.food.map((entry) => entry[check.nutrient]));
      const byName = new Map<string, {name: string; entries: number; amount: number}>();
      for (const entry of input.food) {
        const key = entry.name.trim().toLowerCase();
        const source = byName.get(key) ?? {name: entry.name.trim(), entries: 0, amount: 0};
        source.entries++;
        source.amount = sumNumbers([source.amount, entry[check.nutrient]]);
        byName.set(key, source);
      }
      const sources = [...byName.values()]
        .filter((source) => source.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, MAX_SOURCES)
        .map((source) => ({
          ...source,
          amount: round1(source.amount),
          share: total > 0 ? Math.round((source.amount / total) * 100) / 100 : 0,
        }));
      return {nutrient: check.nutrient, avgPerDay: check.avg, goal: check.goal, sources};
    });
}

// ---------------------------------------------------------------------------
// Body metrics
// ---------------------------------------------------------------------------

export type ReportBodyMetric = {
  /** Preset key; null for the user's own metrics. */
  key: string | null;
  label: string;
  unit: string;
  direction: string;
  decimals: number;
  /** This week's values. */
  values: number[];
  /** The previous week's values, or the latest earlier one if it had none. */
  previousValues: number[];
};

export type BodyMetricSummary = Omit<
  ReportBodyMetric,
  'values' | 'previousValues'
> & {
  count: number;
  /** Average of this week's values; null when there were none. */
  avg: number | null;
  /** Average of `previousValues`, the baseline for the weekly change. */
  prevAvg: number | null;
};

/**
 * This week's average for each tracked body metric, beside last week's, the
 * same way as weight. Metrics never logged are left out.
 */
export function computeBodyMetricSummaries(
  metrics: ReportBodyMetric[],
): BodyMetricSummary[] {
  return metrics
    .filter((metric) => metric.values.length + metric.previousValues.length > 0)
    .map(({values, previousValues, ...metric}) => ({
      ...metric,
      count: values.length,
      avg: values.length === 0 ? null : average(values),
      prevAvg: previousValues.length === 0 ? null : average(previousValues),
    }));
}

// ---------------------------------------------------------------------------
// Strength progress
// ---------------------------------------------------------------------------

export type StrengthProgress = {
  exercise: string;
  /** Heaviest load in the most recent session before this week; null if none. */
  fromWeight: number | null;
  /** Heaviest load this week. */
  toWeight: number;
  goalWeight: number | null;
};

const MAX_STRENGTH_ROWS = 15;

function exerciseKey(entry: ReportExercise): string {
  return entry.exerciseGoalId ?? entry.name.trim().toLowerCase();
}

export function computeStrengthProgress(
  weekEntries: ReportExercise[],
  /** Weighted entries from earlier weeks, any order. */
  priorEntries: ReportExercise[],
  goalWeights: ReadonlyMap<string, number | null>,
): StrengthProgress[] {
  const thisWeek = new Map<string, {name: string; weight: number; goalId: string | null}>();
  for (const entry of weekEntries) {
    if (entry.weight === null) continue;
    const key = exerciseKey(entry);
    const current = thisWeek.get(key);
    if (!current || entry.weight > current.weight) {
      thisWeek.set(key, {name: entry.name, weight: entry.weight, goalId: entry.exerciseGoalId});
    }
  }

  return [...thisWeek.entries()].slice(0, MAX_STRENGTH_ROWS).map(([key, current]) => {
    const prior = priorEntries.filter(
      (entry) => entry.weight !== null && exerciseKey(entry) === key,
    );
    const lastDate = prior.reduce<string | null>(
      (latest, entry) => (latest === null || entry.date > latest ? entry.date : latest),
      null,
    );
    const fromWeight =
      lastDate === null
        ? null
        : Math.max(
            ...prior.filter((entry) => entry.date === lastDate).map((entry) => entry.weight!),
          );
    return {
      exercise: current.name,
      fromWeight,
      toWeight: current.weight,
      goalWeight: current.goalId ? (goalWeights.get(current.goalId) ?? null) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Focus items
// ---------------------------------------------------------------------------

export type FocusDirection = 'min' | 'max';

type FocusMetricDef = {
  description: string;
  /** Fixed direction; null lets the AI choose. */
  direction: FocusDirection | null;
  min: number;
  max: number;
};

/** The only metrics a focus item may use, so every item can be checked in code. */
export const FOCUS_METRICS = {
  avgCalories: {description: 'average daily kcal on logged days', direction: null, min: 0, max: 10000},
  avgProtein: {description: 'average daily protein g', direction: 'min', min: 0, max: 500},
  avgCarbs: {description: 'average daily carbs g', direction: null, min: 0, max: 1000},
  avgFat: {description: 'average daily fat g', direction: 'max', min: 0, max: 500},
  avgSaturatedFat: {description: 'average daily saturated fat g', direction: 'max', min: 0, max: 200},
  calorieDaysOver: {description: 'days more than 5% over the calorie goal', direction: 'max', min: 0, max: 7},
  proteinDaysHit: {description: 'days at or above the protein goal', direction: 'min', min: 0, max: 7},
  satFatDaysOver: {description: 'days over the saturated fat goal', direction: 'max', min: 0, max: 7},
  daysLogged: {description: 'days with food logged', direction: 'min', min: 0, max: 7},
  planAdherence: {description: 'percent of planned exercises done', direction: 'min', min: 0, max: 100},
  cardioMinutes: {description: 'total minutes of timed/cardio exercise', direction: 'min', min: 0, max: 3000},
  strengthSessions: {description: 'days with strength exercise', direction: 'min', min: 0, max: 7},
  weighInCount: {description: 'number of weigh-ins', direction: 'min', min: 0, max: 21},
  foodMeals: {
    description: 'food entries whose name contains `food` (a keyword, e.g. "paneer")',
    direction: null,
    min: 0,
    max: 50,
  },
} as const satisfies Record<string, FocusMetricDef>;

export type FocusMetric = keyof typeof FOCUS_METRICS;

export type FocusItem = {
  /** Stable across weeks for the same goal, so streaks can be counted. */
  id: string;
  text: string;
  metric: FocusMetric;
  food?: string;
  target: number;
  direction: FocusDirection;
  /** The metric's value in the week the item was set; null if not measurable then. */
  baseline: number | null;
};

export type FocusStatus = 'met' | 'improved' | 'missed' | 'no-data';

export type FocusResult = FocusItem & {
  actual: number | null;
  status: FocusStatus;
  /** Consecutive reports with the same met / not-met outcome, including this one. */
  streak: number;
};

export function focusMetricValue(
  metric: FocusMetric,
  food: string | undefined,
  metrics: WeekMetrics,
  foodEntries: readonly ReportFood[],
): number | null {
  switch (metric) {
    case 'planAdherence':
      return planAdherence(metrics);
    case 'foodMeals': {
      if (!food) return null;
      const keyword = food.toLowerCase();
      return foodEntries.filter((entry) => entry.name.toLowerCase().includes(keyword))
        .length;
    }
    case 'avgCalories':
    case 'avgProtein':
    case 'avgCarbs':
    case 'avgFat':
    case 'avgSaturatedFat':
    case 'calorieDaysOver':
    case 'proteinDaysHit':
    case 'satFatDaysOver':
      // Nutrition averages mean nothing without food logs.
      return metrics.daysLogged === 0 ? null : metrics[metric];
    default:
      return metrics[metric];
  }
}

function meets(value: number, target: number, direction: FocusDirection) {
  return direction === 'min' ? value >= target : value <= target;
}

export function evaluateFocus(
  items: readonly FocusItem[],
  metrics: WeekMetrics,
  foodEntries: readonly ReportFood[],
  previousResults: readonly FocusResult[] | null,
): FocusResult[] {
  return items.map((item) => {
    const actual = focusMetricValue(item.metric, item.food, metrics, foodEntries);
    let status: FocusStatus;
    if (actual === null) {
      status = 'no-data';
    } else if (meets(actual, item.target, item.direction)) {
      status = 'met';
    } else if (
      item.baseline !== null &&
      (item.direction === 'min' ? actual > item.baseline : actual < item.baseline)
    ) {
      status = 'improved';
    } else {
      status = 'missed';
    }

    const previous = previousResults?.find((result) => result.id === item.id);
    let streak = 0;
    if (status !== 'no-data') {
      const sameOutcome =
        previous &&
        previous.status !== 'no-data' &&
        (previous.status === 'met') === (status === 'met');
      streak = sameOutcome ? previous.streak + 1 : 1;
    }
    return {...item, actual, status, streak};
  });
}

export const MAX_FOCUS_ITEMS = 3;

const proposalSchema = z.object({
  text: z.string().trim().min(1).max(160),
  metric: z.enum(Object.keys(FOCUS_METRICS) as [FocusMetric, ...FocusMetric[]]),
  target: z.coerce.number().finite(),
  direction: z.enum(['min', 'max']).optional().catch(undefined),
  food: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(30)
    .optional()
    .catch(undefined),
});

/**
 * Turns the AI's proposed focus items into checkable ones: unknown metrics,
 * out-of-range targets, missing directions and duplicates are dropped.
 */
export function parseFocusProposals(
  raw: unknown,
  metrics: WeekMetrics,
  foodEntries: readonly ReportFood[],
): FocusItem[] {
  if (!Array.isArray(raw)) return [];
  const items: FocusItem[] = [];

  for (const candidate of raw) {
    if (items.length >= MAX_FOCUS_ITEMS) break;
    const parsed = proposalSchema.safeParse(candidate);
    if (!parsed.success) continue;

    const {text, metric, food} = parsed.data;
    const def: FocusMetricDef = FOCUS_METRICS[metric];
    const direction = def.direction ?? parsed.data.direction;
    if (!direction) continue;
    if (metric === 'foodMeals' && !food) continue;

    const target = round1(parsed.data.target);
    if (target < def.min || target > def.max) continue;

    const id = metric === 'foodMeals' ? `foodMeals:${food}` : metric;
    if (items.some((item) => item.id === id)) continue;

    items.push({
      id,
      text,
      metric,
      ...(metric === 'foodMeals' && {food}),
      target,
      direction,
      baseline: focusMetricValue(metric, food, metrics, foodEntries),
    });
  }
  return items;
}
