import {z} from 'zod';
import {MAX_REPS} from '@/lib/workout';

export const EXERCISE_TYPES = ['TIME', 'STRENGTH'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const MAX_SETS = 20;

const weightSchema = z.number().positive().nullish();

/** One logged set; sets in a log can differ, e.g. a heavier weight each set. */
export const exerciseSetSchema = z.object({
  reps: z.number().int().min(1).max(MAX_REPS),
  weight: weightSchema,
});
export const exerciseSetsSchema = z.array(exerciseSetSchema).min(1).max(MAX_SETS);
export type ExerciseSet = {reps: number; weight?: number | null};

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

export type ExerciseFields = {
  type: ExerciseType;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
};

/** Flattens validated details into DB columns, nulling fields that don't apply to the type. */
export function toExerciseFields(details: ExerciseDetails): ExerciseFields {
  if (details.type === 'STRENGTH') {
    return {
      type: 'STRENGTH',
      durationMin: null,
      sets: details.sets,
      reps: details.reps,
      weight: details.weight ?? null,
    };
  }
  return {
    type: 'TIME',
    durationMin: details.durationMin,
    sets: null,
    reps: null,
    weight: null,
  };
}

/** The same reps and weight for every set, as planned. */
export function uniformSets(
  sets: number,
  reps: number,
  weight: number | null | undefined,
): ExerciseSet[] {
  return Array.from({length: sets}, () => ({reps, weight: weight ?? null}));
}

/**
 * Summary columns for a log's sets: the count, plus the top set (heaviest,
 * then most reps) so weight trends follow the best lift.
 */
export function summarizeSets(sets: readonly ExerciseSet[]): {
  sets: number;
  reps: number;
  weight: number | null;
} {
  const top = sets.reduce((best, set) => {
    const weight = set.weight ?? 0;
    const bestWeight = best.weight ?? 0;
    return weight > bestWeight || (weight === bestWeight && set.reps > best.reps)
      ? set
      : best;
  });
  return {sets: sets.length, reps: top.reps, weight: top.weight ?? null};
}

/** Nested-create rows for a log's sets, numbered from 1. */
export function toSetRows(sets: readonly ExerciseSet[]) {
  return sets.map((set, index) => ({
    position: index + 1,
    reps: set.reps,
    weight: set.weight ?? null,
  }));
}

export function isUniform(sets: readonly ExerciseSet[]): boolean {
  return sets.every(
    (set) =>
      set.reps === sets[0].reps && (set.weight ?? null) === (sets[0].weight ?? null),
  );
}

export function formatExerciseDetail(item: {
  type: string;
  durationMin?: number | null;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  exerciseSets?: readonly ExerciseSet[];
}): string {
  const list = item.exerciseSets;
  if (item.type === 'STRENGTH' && list?.length && !isUniform(list)) {
    if (list.every((set) => !set.weight)) {
      return `${list.map((set) => set.reps).join(', ')} reps`;
    }
    return list
      .map((set) => (set.weight ? `${set.reps} @ ${set.weight}` : `${set.reps}`))
      .join(', ');
  }
  if (item.type === 'STRENGTH' && list?.length) {
    return formatExerciseDetail({
      type: 'STRENGTH',
      sets: list.length,
      reps: list[0].reps,
      weight: list[0].weight,
    });
  }
  if (item.type === 'STRENGTH') {
    const base = `${item.sets ?? 0} × ${item.reps ?? 0}`;
    return item.weight ? `${base} @ ${item.weight}` : base;
  }
  return `${item.durationMin ?? 0} min`;
}

export const EXERCISE_NOTES_MAX = 500;

/** Loads an exercise log entry's sets and its planned goal's notes. */
export const EXERCISE_LOG_INCLUDE = {
  exerciseGoal: {select: {notes: true}},
  exerciseSets: {
    orderBy: {position: 'asc'},
    select: {reps: true, weight: true},
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
