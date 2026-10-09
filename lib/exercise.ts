import {z} from 'zod';

export const EXERCISE_TYPES = ['TIME', 'STRENGTH'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const exerciseDetailsSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TIME'),
    durationMin: z.number().int().min(1),
  }),
  z.object({
    type: z.literal('STRENGTH'),
    sets: z.number().int().min(1),
    reps: z.number().int().min(1),
    weight: z.number().positive().nullish(),
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

export function formatExerciseDetail(item: {
  type: string;
  durationMin?: number | null;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
}): string {
  if (item.type === 'STRENGTH') {
    const base = `${item.sets ?? 0} × ${item.reps ?? 0}`;
    return item.weight ? `${base} @ ${item.weight}` : base;
  }
  return `${item.durationMin ?? 0} min`;
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
