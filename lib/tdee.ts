import {z} from 'zod';
import type DecimalJs from 'decimal.js';
import {Decimal, sumNumbers} from './decimal';

// Maintenance calories (TDEE): a formula estimate from the user's profile, and
// an adaptive figure from their own logged weight and intake once there's
// enough data. Pure functions, free of the database so client components and tests
// can import them.

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = {
  sedentary: {label: 'Sedentary', detail: 'Little or no exercise', multiplier: 1.2},
  light: {label: 'Lightly active', detail: 'Exercise 1–3 days/week', multiplier: 1.375},
  moderate: {label: 'Moderately active', detail: 'Exercise 3–5 days/week', multiplier: 1.55},
  very: {label: 'Very active', detail: 'Exercise 6–7 days/week', multiplier: 1.725},
  extreme: {label: 'Extremely active', detail: 'Physical job + training', multiplier: 1.9},
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;

/**
 * Preset goals. calorieChange is a fraction of maintenance; protein is grams
 * per kg of body weight, from common sports-nutrition ranges.
 */
export const FITNESS_GOALS = {
  lose_fat: {
    label: 'Lose fat',
    detail: 'Steady weight loss while keeping muscle',
    calorieChange: -0.2,
    proteinPerKg: 2.0,
  },
  recomp: {
    label: 'Body recomposition',
    detail: 'Lose fat and build muscle at about the same weight',
    calorieChange: -0.1,
    proteinPerKg: 2.2,
  },
  maintain: {
    label: 'Maintain weight',
    detail: 'Hold your current weight',
    calorieChange: 0,
    proteinPerKg: 1.6,
  },
  build_muscle: {
    label: 'Build muscle',
    detail: 'Lean gain with minimal fat',
    calorieChange: 0.1,
    proteinPerKg: 1.8,
  },
  general_health: {
    label: 'General health & fitness',
    detail: 'Eat well and move more, no weight target',
    calorieChange: 0,
    proteinPerKg: 1.4,
  },
} as const;
export type FitnessGoal = keyof typeof FITNESS_GOALS;

/** Largest daily deficit suggested, however high maintenance is. */
export const MAX_DEFICIT = 750;
/** Lowest suggested intake, so a deficit never drops below a safe floor. */
export const MIN_CALORIES: Record<Sex, number> = {male: 1500, female: 1200};

/** kcal in roughly 1 kg of body fat. */
export const KCAL_PER_KG = 7700;
/** Days with both a weigh-in and food logged needed for the adaptive TDEE. */
export const ADAPTIVE_MIN_DAYS = 14;
/** How far back the adaptive TDEE looks. */
export const ADAPTIVE_LOOKBACK_DAYS = 28;

export const LIMITS = {
  age: {min: 15, max: 100},
  heightCm: {min: 100, max: 250},
  weightKg: {min: 30, max: 300},
  bodyFatPct: {min: 3, max: 60},
} as const;

const range = (key: keyof typeof LIMITS) =>
  z.coerce.number().finite().min(LIMITS[key].min).max(LIMITS[key].max);

/** What the profile form submits. Weight is logged as a weigh-in. */
export const profileSchema = z.object({
  sex: z.enum(SEXES),
  age: range('age').int(),
  heightCm: range('heightCm'),
  weightKg: range('weightKg'),
  bodyFatPct: range('bodyFatPct').nullable().optional().default(null),
  activityLevel: z.enum(
    Object.keys(ACTIVITY_LEVELS) as [ActivityLevel, ...ActivityLevel[]],
  ),
  goal: z.enum(Object.keys(FITNESS_GOALS) as [FitnessGoal, ...FitnessGoal[]]),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export function isActivityLevel(value: unknown): value is ActivityLevel {
  return typeof value === 'string' && Object.hasOwn(ACTIVITY_LEVELS, value);
}

export function isFitnessGoal(value: unknown): value is FitnessGoal {
  return typeof value === 'string' && Object.hasOwn(FITNESS_GOALS, value);
}

export function isSex(value: unknown): value is Sex {
  return value === 'male' || value === 'female';
}

/** Age stored as a birth year so it doesn't go stale; off by at most a year. */
export const birthYearForAge = (age: number, currentYear: number) =>
  currentYear - age;
export const ageFromBirthYear = (birthYear: number, currentYear: number) =>
  currentYear - birthYear;

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

export type BmrFormula = 'mifflin-st-jeor' | 'katch-mcardle';

export const BMR_FORMULA_LABELS: Record<BmrFormula, string> = {
  'mifflin-st-jeor': 'Mifflin-St Jeor',
  'katch-mcardle': 'Katch-McArdle',
};

export function mifflinStJeorBmr(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  const base = new Decimal(10)
    .times(input.weightKg)
    .plus(new Decimal(6.25).times(input.heightCm))
    .minus(new Decimal(5).times(input.age));
  return (input.sex === 'male' ? base.plus(5) : base.minus(161)).toNumber();
}

export function katchMcArdleBmr(input: {
  weightKg: number;
  bodyFatPct: number;
}): number {
  const leanMassKg = new Decimal(input.weightKg).times(
    new Decimal(1).minus(new Decimal(input.bodyFatPct).div(100)),
  );
  return new Decimal(370).plus(new Decimal(21.6).times(leanMassKg)).toNumber();
}

export type BodyStats = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number | null;
};

/** Katch-McArdle when body fat is known, otherwise Mifflin-St Jeor. */
export function calculateBmr(stats: BodyStats): {bmr: number; formula: BmrFormula} {
  if (stats.bodyFatPct != null) {
    return {
      bmr: katchMcArdleBmr({weightKg: stats.weightKg, bodyFatPct: stats.bodyFatPct}),
      formula: 'katch-mcardle',
    };
  }
  return {bmr: mifflinStJeorBmr(stats), formula: 'mifflin-st-jeor'};
}

export function formulaTdee(bmr: number, activityLevel: ActivityLevel): number {
  return new Decimal(bmr).times(ACTIVITY_LEVELS[activityLevel].multiplier).toNumber();
}

/** One day's totals; either may be missing. */
export type DailyLog = {
  date: string;
  weightKg: number | null;
  calories: number | null;
};

export type AdaptiveTdee = {
  tdee: number;
  /** Days with both a weigh-in and food logged. */
  days: number;
  avgIntake: number;
  firstWeekAvg: number;
  lastWeekAvg: number;
};

const average = (values: number[]) =>
  new Decimal(sumNumbers(values)).div(values.length);

const hasBoth = (
  log: DailyLog,
): log is DailyLog & {weightKg: number; calories: number} =>
  log.weightKg !== null && log.calories !== null;

export const countLoggedDays = (logs: DailyLog[]) => logs.filter(hasBoth).length;

/**
 * TDEE from intake and weight change: what you ate, less the energy stored or
 * released as the weight changed. Compares the first and last 7 days' average
 * weight, never single weigh-ins, to smooth out water swings. Null with fewer
 * than ADAPTIVE_MIN_DAYS days that have both.
 */
export function adaptiveTdee(logs: DailyLog[]): AdaptiveTdee | null {
  const days = logs
    .filter(hasBoth)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < ADAPTIVE_MIN_DAYS) return null;

  const firstWeekAvg = average(days.slice(0, 7).map((day) => day.weightKg));
  const lastWeekAvg = average(days.slice(-7).map((day) => day.weightKg));
  // Gap between the midpoints of the two weeks.
  const span = days.length - 7;
  const avgIntake = average(days.map((day) => day.calories));
  const tdee = avgIntake.minus(
    lastWeekAvg.minus(firstWeekAvg).times(KCAL_PER_KG).div(span),
  );
  return {
    tdee: tdee.toNumber(),
    days: days.length,
    avgIntake: avgIntake.toNumber(),
    firstWeekAvg: firstWeekAvg.toNumber(),
    lastWeekAvg: lastWeekAvg.toNumber(),
  };
}

/**
 * Merges food and weigh-ins into one entry per date: calories summed, weight
 * averaged when there were several weigh-ins.
 */
export function buildDailyLogs(
  food: {date: string; calories: number}[],
  weights: {date: string; weight: number}[],
): DailyLog[] {
  const byDate = new Map<string, {calories: number[]; weights: number[]}>();
  const entry = (date: string) => {
    let day = byDate.get(date);
    if (!day) {
      day = {calories: [], weights: []};
      byDate.set(date, day);
    }
    return day;
  };
  for (const item of food) entry(item.date).calories.push(item.calories);
  for (const item of weights) entry(item.date).weights.push(item.weight);

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      calories: day.calories.length ? sumNumbers(day.calories) : null,
      weightKg: day.weights.length ? average(day.weights).toNumber() : null,
    }));
}

// ---------------------------------------------------------------------------
// Putting it together
// ---------------------------------------------------------------------------

export type Maintenance = {
  bmr: number;
  bmrFormula: BmrFormula;
  formulaTdee: number;
  adaptive: {tdee: number; days: number; avgIntake: number; weightChangeKg: number} | null;
  /** The adaptive TDEE when available, otherwise the formula one. */
  maintenance: number;
  /** True when maintenance is the formula estimate. */
  isEstimate: boolean;
  /** Days with both a weigh-in and food logged, towards ADAPTIVE_MIN_DAYS. */
  loggedDays: number;
};

/** Rounds half up to `step` (1 = whole numbers). */
const roundTo = (value: DecimalJs.Value, step: DecimalJs.Value = 1) =>
  new Decimal(value).div(step).round().times(step).toNumber();

/** All calorie outputs rounded to whole numbers. */
export function calculateMaintenance(
  stats: BodyStats & {activityLevel: ActivityLevel},
  logs: DailyLog[] = [],
): Maintenance {
  const {bmr, formula} = calculateBmr(stats);
  const fromFormula = roundTo(formulaTdee(bmr, stats.activityLevel));
  const adaptive = adaptiveTdee(logs);
  const rounded = adaptive && {
    tdee: roundTo(adaptive.tdee),
    days: adaptive.days,
    avgIntake: roundTo(adaptive.avgIntake),
    weightChangeKg: roundTo(
      new Decimal(adaptive.lastWeekAvg).minus(adaptive.firstWeekAvg),
      0.1,
    ),
  };
  return {
    bmr: roundTo(bmr),
    bmrFormula: formula,
    formulaTdee: fromFormula,
    adaptive: rounded,
    maintenance: rounded?.tdee ?? fromFormula,
    isEstimate: !rounded,
    loggedDays: countLoggedDays(logs),
  };
}

export type GoalTargets = {calories: number; protein: number};

/**
 * Suggested daily calories and protein for a goal. Deficits are capped at
 * MAX_DEFICIT and never go below a per-sex floor.
 */
export function goalTargets(
  goal: FitnessGoal,
  maintenance: number,
  weightKg: number,
  sex: Sex,
): GoalTargets {
  const {calorieChange, proteinPerKg} = FITNESS_GOALS[goal];
  const change = Decimal.max(
    new Decimal(maintenance).times(calorieChange),
    -MAX_DEFICIT,
  );
  let calories = change.plus(maintenance);
  if (change.lt(0)) {
    // ...but never above maintenance for a very small TDEE.
    calories = Decimal.min(
      maintenance,
      Decimal.max(calories, MIN_CALORIES[sex]),
    );
  }
  return {
    // Rounded to tidy steps that are easy to aim for.
    calories: roundTo(calories, 10),
    protein: roundTo(new Decimal(weightKg).times(proteinPerKg), 5),
  };
}
