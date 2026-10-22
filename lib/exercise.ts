import {z} from 'zod';
import {DEFAULT_TEMPO_MS, MAX_REPS} from '@/lib/workout';

export const EXERCISE_TYPES = ['TIME', 'STRENGTH'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Plan type for several exercises run back to back and logged as one. */
export const SEQUENCE_TYPE = 'SEQUENCE';

export function isSequence(item: {type: string}): boolean {
  return item.type === SEQUENCE_TYPE;
}

export const MAX_SETS = 20;
// A day, which no single set should take.
export const MAX_SET_SEC = 24 * 60 * 60;

const weightSchema = z.number().positive().nullish();

/**
 * One set, done either for reps or for a time. Sets in a log or plan can
 * differ, e.g. a heavier weight each set or a hold after some reps.
 */
const setFields = {
  reps: z.number().int().min(1).max(MAX_REPS).nullish(),
  durationSec: z.number().int().min(1).max(MAX_SET_SEC).nullish(),
  weight: weightSchema,
};
const hasOneAmount = (set: {
  reps?: number | null;
  durationSec?: number | null;
}) => (set.reps != null) !== (set.durationSec != null);

export const exerciseSetSchema = z.object(setFields).refine(hasOneAmount, {
  message: 'Each set needs either reps or a time',
});
export const exerciseSetsSchema = z.array(exerciseSetSchema).min(1).max(MAX_SETS);
export type ExerciseSet = {
  reps?: number | null;
  durationSec?: number | null;
  weight?: number | null;
  // Which exercise a set of a sequence was
  name?: string | null;
  catalogId?: string | null;
};

export const DEFAULT_BREAK_SEC = 60;
export const MAX_BREAK_SEC = 600;
// Each step is logged as one set, so the log limit applies.
export const MAX_SEQUENCE_STEPS = MAX_SETS;

/** One set of one exercise in a sequence, with the break before it. */
export const sequenceStepSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    catalogId: z.string().trim().min(1).nullish(),
    ...setFields,
    restSec: z.number().int().min(0).max(MAX_BREAK_SEC).default(0),
  })
  .refine(hasOneAmount, {message: 'Each step needs either reps or a time'});
export type SequenceStep = z.infer<typeof sequenceStepSchema>;

/** A sequence's steps; nothing comes before the first, so it has no break. */
export const sequenceStepsSchema = z
  .array(sequenceStepSchema)
  .min(1)
  .max(MAX_SEQUENCE_STEPS)
  .transform((steps) =>
    steps.map((step, index) => (index === 0 ? {...step, restSec: 0} : step)),
  );

export const sequenceInputSchema = z.object({
  type: z.literal(SEQUENCE_TYPE),
  steps: sequenceStepsSchema,
});

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

function cleanStep(step: SequenceStep): SequenceStep {
  return {
    ...cleanSet(step),
    name: step.name,
    catalogId: step.catalogId ?? null,
    restSec: step.restSec,
  };
}

/** A sequence's steps as sets, each labelled with its exercise. */
export function stepSets(steps: readonly SequenceStep[]): ExerciseSet[] {
  return steps.map((step) => ({
    ...cleanSet(step),
    name: step.name,
    catalogId: step.catalogId ?? null,
  }));
}

/** Columns for a sequence plan; the summary columns cover all its steps. */
export function toSequenceFields(steps: readonly SequenceStep[]) {
  return {
    ...toExerciseFields(steps),
    type: SEQUENCE_TYPE,
    setPlan: null,
    steps: JSON.stringify(steps.map(cleanStep)),
  };
}

/** A sequence's stored steps, or null when it has none or they can't be read. */
export function parseSequenceSteps(
  value: string | null | undefined,
): SequenceStep[] | null {
  if (!value) return null;
  try {
    const parsed = sequenceStepsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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
  steps?: string | null;
  exerciseSets?: readonly ExerciseSet[];
};

/**
 * Every set of a log or plan. Entries saved before sets were stored are
 * rebuilt from their summary: the same set repeated, or one timed set.
 */
export function setsOf(item: ExerciseWithSets): ExerciseSet[] {
  if (item.exerciseSets?.length) return [...item.exerciseSets];
  const steps = parseSequenceSteps(item.steps);
  if (steps) return stepSets(steps);
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
    name: set.name ?? null,
    catalogId: set.catalogId ?? null,
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

function formatStepAmount(set: ExerciseSet): string {
  const amount = isRepSet(set)
    ? `${set.reps} reps`
    : formatDuration(set.durationSec ?? 0);
  return set.weight ? `${amount} @ ${set.weight}` : amount;
}

/** A sequence's steps and breaks, one line each, for lists and proposals. */
export function describeSequence(steps: readonly SequenceStep[]): string[] {
  return steps.flatMap((step, index) => [
    ...(step.restSec > 0 ? [`Break ${formatDuration(step.restSec)}`] : []),
    `${index + 1}. ${step.name} · ${formatStepAmount(step)}`,
  ]);
}

/** Rough minutes a sequence takes, counting reps at the default tempo. */
export function sequenceMinutes(steps: readonly SequenceStep[]): number {
  const seconds = steps.reduce(
    (sum, step) =>
      sum +
      step.restSec +
      (step.durationSec ?? (step.reps ?? 0) * (DEFAULT_TEMPO_MS / 1000)),
    0,
  );
  return Math.max(1, Math.round(seconds / 60));
}

/** The exercises in named sets, e.g. "Jumping jacks, Squats +2 · 6 steps". */
function namedSetsSummary(sets: readonly ExerciseSet[]): string {
  const names = [...new Set(sets.map((set) => set.name ?? 'Exercise'))];
  const shown = names.slice(0, 2).join(', ');
  const more = names.length > 2 ? ` +${names.length - 2}` : '';
  const count = `${sets.length} ${sets.length === 1 ? 'step' : 'steps'}`;
  return `${shown}${more} · ${count}`;
}

/** The distinct built-in exercises a plan item uses, for naming its day. */
export function goalCatalogIds(goal: {
  type: string;
  catalogId?: string | null;
  steps?: string | null;
}): (string | null)[] {
  if (!isSequence(goal)) return [goal.catalogId ?? null];
  const steps = parseSequenceSteps(goal.steps) ?? [];
  return [...new Set(steps.map((step) => step.catalogId ?? null))];
}

export function formatExerciseDetail(item: ExerciseWithSets): string {
  const steps = parseSequenceSteps(item.steps);
  if (steps && !item.exerciseSets?.length) {
    return `${namedSetsSummary(stepSets(steps))} · ~${sequenceMinutes(steps)} min`;
  }
  const list = setsOf(item);
  if (list.some((set) => set.name)) return namedSetsSummary(list);
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
  .and(z.union([sequenceInputSchema, exerciseInputSchema]));
export type ExerciseGoalInput = z.infer<typeof exerciseGoalInputSchema>;

/** The sets a planned exercise or sequence describes. */
export function goalInputSets(input: ExerciseGoalInput): ExerciseSet[] {
  return 'steps' in input ? stepSets(input.steps) : inputSets(input);
}

/** Loads an exercise log entry's sets and its planned goal's notes. */
export const EXERCISE_LOG_INCLUDE = {
  exerciseGoal: {select: {notes: true}},
  exerciseSets: {
    orderBy: {position: 'asc'},
    select: {
      reps: true,
      durationSec: true,
      weight: true,
      name: true,
      catalogId: true,
    },
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
