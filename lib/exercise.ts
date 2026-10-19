import {z} from 'zod';
import {MAX_REPS} from '@/lib/workout';

export const EXERCISE_TYPES = ['TIME', 'STRENGTH'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const MAX_SETS = 20;
// A day, which no single set should take.
export const MAX_SET_SEC = 24 * 60 * 60;

const weightSchema = z.number().positive().nullish();

/**
 * One set, done either for reps or for a time. Sets in a log or plan can
 * differ, e.g. a heavier weight each set or a hold after some reps.
 */
export const exerciseSetSchema = z
  .object({
    reps: z.number().int().min(1).max(MAX_REPS).nullish(),
    durationSec: z.number().int().min(1).max(MAX_SET_SEC).nullish(),
    weight: weightSchema,
  })
  .refine((set) => (set.reps != null) !== (set.durationSec != null), {
    message: 'Each set needs either reps or a time',
  });
export const exerciseSetsSchema = z.array(exerciseSetSchema).min(1).max(MAX_SETS);
export type ExerciseSet = {
  reps?: number | null;
  durationSec?: number | null;
  weight?: number | null;
};

/** The older summary form of an exercise, still accepted by the APIs. */
export const exerciseDetailsSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TIME'),
    durationMin: z.number().int().min(1),
  }),
  z.object({
    type: z.literal('STRENGTH'),
    sets: z.number().int().min(1).max(MAX_SETS),
    reps: z.number().int().min(1).max(MAX_REPS),
    weight: weightSchema,
  }),
]);
export type ExerciseDetails = z.infer<typeof exerciseDetailsSchema>;

/** An exercise as sent: each set listed, or the older summary. */
export const exerciseInputSchema = z.union([
  z.object({exerciseSets: exerciseSetsSchema}),
  exerciseDetailsSchema,
]);
export type ExerciseInput = z.infer<typeof exerciseInputSchema>;

export type ExerciseFields = {
  type: ExerciseType;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
};

/** The same reps and weight for every set, as planned. */
export function uniformSets(
  sets: number,
  reps: number,
  weight: number | null | undefined,
): ExerciseSet[] {
  return Array.from({length: sets}, () => ({reps, weight: weight ?? null}));
}

/** The sets an input describes, expanding the older summary form. */
export function inputSets(input: ExerciseInput): ExerciseSet[] {
  if ('exerciseSets' in input) return input.exerciseSets;
  return input.type === 'STRENGTH'
    ? uniformSets(input.sets, input.reps, input.weight)
    : [{durationSec: input.durationMin * 60, weight: null}];
}

export function isRepSet(set: ExerciseSet): boolean {
  return set.reps != null;
}

/**
 * Summary of rep sets: the count, plus the top set (heaviest, then most
 * reps) so weight trends follow the best lift.
 */
export function summarizeSets(sets: readonly ExerciseSet[]): {
  sets: number;
  reps: number;
  weight: number | null;
} {
  const top = sets.reduce((best, set) => {
    const weight = set.weight ?? 0;
    const bestWeight = best.weight ?? 0;
    return weight > bestWeight ||
      (weight === bestWeight && (set.reps ?? 0) > (best.reps ?? 0))
      ? set
      : best;
  });
  return {sets: sets.length, reps: top.reps ?? 0, weight: top.weight ?? null};
}

/**
 * Summary columns for a list of sets. An exercise with any rep sets counts
 * as strength; time is kept as total minutes either way.
 */
export function toExerciseFields(sets: readonly ExerciseSet[]): ExerciseFields {
  const seconds = sets.reduce((sum, set) => sum + (set.durationSec ?? 0), 0);
  const durationMin = seconds > 0 ? Math.ceil(seconds / 60) : null;
  const repSets = sets.filter(isRepSet);
  if (repSets.length > 0) {
    return {
      type: 'STRENGTH',
      durationMin,
      ...summarizeSets(repSets),
      sets: sets.length,
    };
  }
  const weights = sets.flatMap((set) => (set.weight ? [set.weight] : []));
  return {
    type: 'TIME',
    durationMin,
    sets: sets.length,
    reps: null,
    weight: weights.length > 0 ? Math.max(...weights) : null,
  };
}

/** Only the fields a set uses, so stored plans stay tidy. */
function cleanSet(set: ExerciseSet): ExerciseSet {
  return isRepSet(set)
    ? {reps: set.reps, weight: set.weight ?? null}
    : {durationSec: set.durationSec, weight: set.weight ?? null};
}

/** Columns for plans and saved items, which keep every set as well. */
export function toPlanFields(sets: readonly ExerciseSet[]) {
  return {
    ...toExerciseFields(sets),
    setPlan: JSON.stringify(sets.map(cleanSet)),
  };
}

/** A plan's stored sets, or null when it has none or they can't be read. */
export function parseSetPlan(
  value: string | null | undefined,
): ExerciseSet[] | null {
  if (!value) return null;
  try {
    const parsed = exerciseSetsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ExerciseWithSets = {
  type: string;
  durationMin?: number | null;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  setPlan?: string | null;
  exerciseSets?: readonly ExerciseSet[];
};

/**
 * Every set of a log or plan. Entries saved before sets were stored are
 * rebuilt from their summary: the same set repeated, or one timed set.
 */
export function setsOf(item: ExerciseWithSets): ExerciseSet[] {
  if (item.exerciseSets?.length) return [...item.exerciseSets];
  const plan = parseSetPlan(item.setPlan);
  if (plan) return plan;
  if (item.type === 'STRENGTH') {
    return uniformSets(item.sets ?? 1, item.reps ?? 1, item.weight);
  }
  return [{durationSec: Math.max(1, item.durationMin ?? 1) * 60, weight: null}];
}

/** Nested-create rows for a log's sets, numbered from 1. */
export function toSetRows(sets: readonly ExerciseSet[]) {
  return sets.map((set, index) => ({
    position: index + 1,
    reps: set.reps ?? null,
    durationSec: isRepSet(set) ? null : (set.durationSec ?? null),
    weight: set.weight ?? null,
  }));
}

export function isUniform(sets: readonly ExerciseSet[]): boolean {
  const [first] = sets;
  return sets.every(
    (set) =>
      (set.reps ?? null) === (first.reps ?? null) &&
      (set.durationSec ?? null) === (first.durationSec ?? null) &&
      (set.weight ?? null) === (first.weight ?? null),
  );
}

/** A set's time: whole minutes as "30 min", short holds as "45s", else m:ss. */
export function formatDuration(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A set's reps or time, without its weight. */
export function formatSetAmount(set: ExerciseSet): string {
  return isRepSet(set)
    ? String(set.reps)
    : formatDuration(set.durationSec ?? 0);
}

export function formatExerciseDetail(item: ExerciseWithSets): string {
  const list = setsOf(item);
  if (isUniform(list)) {
    const [set] = list;
    const amount = formatSetAmount(set);
    // A single timed set reads as just its time, e.g. "30 min".
    const base =
      list.length === 1 && !isRepSet(set)
        ? amount
        : `${list.length} × ${amount}`;
    return set.weight ? `${base} @ ${set.weight}` : base;
  }
  if (list.every((set) => isRepSet(set) && !set.weight)) {
    return `${list.map((set) => set.reps).join(', ')} reps`;
  }
  return list
    .map((set) => {
      const amount = formatSetAmount(set);
      return set.weight ? `${amount} @ ${set.weight}` : amount;
    })
    .join(', ');
}

export const EXERCISE_NOTES_MAX = 500;

/** A planned exercise as the plan API and chat proposals take it. */
export const exerciseGoalInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    calories: z.number().int().min(0).default(0),
    notes: z.string().max(EXERCISE_NOTES_MAX).nullish(),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((days) => new Set(days).size === days.length),
  })
  .and(exerciseInputSchema);
export type ExerciseGoalInput = z.infer<typeof exerciseGoalInputSchema>;

/** Loads an exercise log entry's sets and its planned goal's notes. */
export const EXERCISE_LOG_INCLUDE = {
  exerciseGoal: {select: {notes: true}},
  exerciseSets: {
    orderBy: {position: 'asc'},
    select: {reps: true, durationSec: true, weight: true},
  },
} as const;

/** Trims notes, storing blank ones as null. */
export function normalizeNotes(
  notes: string | undefined | null,
): string | null {
  return notes?.trim() || null;
}

// Monday-first for display; `day` matches Date#getDay() (0 = Sunday).
export const WEEKDAYS = [
  {day: 1, label: 'Mon', name: 'Monday'},
  {day: 2, label: 'Tue', name: 'Tuesday'},
  {day: 3, label: 'Wed', name: 'Wednesday'},
  {day: 4, label: 'Thu', name: 'Thursday'},
  {day: 5, label: 'Fri', name: 'Friday'},
  {day: 6, label: 'Sat', name: 'Saturday'},
  {day: 0, label: 'Sun', name: 'Sunday'},
] as const;

export const EVERYDAY_MASK = 0b1111111;

export function daysToMask(days: readonly number[]): number {
  return days.reduce((mask, day) => mask | (1 << day), 0);
}

export function maskToDays(mask: number): number[] {
  return WEEKDAYS.map(({day}) => day).filter((day) => isActiveOn(mask, day));
}

export function isActiveOn(mask: number, day: number): boolean {
  return (mask & (1 << day)) !== 0;
}

/** Goals planned for a weekday, ignoring goals created after the day ended. */
export function countPlannedOn(
  goals: readonly {daysMask: number; createdAt: Date}[],
  day: number,
  dayEnd: Date,
): number {
  return goals.filter(
    (goal) => isActiveOn(goal.daysMask, day) && goal.createdAt <= dayEnd,
  ).length;
}

export function isSameExerciseName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
