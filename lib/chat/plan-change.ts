import {z} from 'zod';
import {
  EXERCISE_NOTES_MAX,
  EVERYDAY_MASK,
  MAX_SETS,
  WEEKDAYS,
  daysToMask,
  exerciseGoalInputSchema,
  formatExerciseDetail,
  inputSets,
  isRepSet,
  isSameExerciseName,
  isUniform,
  maskToDays,
  normalizeNotes,
  setsOf,
  uniformSets,
  type ExerciseGoalInput,
  type ExerciseSet,
} from '@/lib/exercise';
import {MAX_REPS} from '@/lib/workout';
import {ToolInputError} from './helpers';

/**
 * A proposed change to the weekly exercise plan, as a chat action stores it.
 * `before` and `updatedAt` let the card show the change and confirm refuse a
 * goal edited since.
 */
export const planChangeSchema = z.discriminatedUnion('operation', [
  z.object({operation: z.literal('add'), goal: exerciseGoalInputSchema}),
  z.object({
    operation: z.literal('update'),
    goalId: z.string().min(1),
    updatedAt: z.string().min(1),
    before: exerciseGoalInputSchema,
    goal: exerciseGoalInputSchema,
  }),
  z.object({
    operation: z.literal('remove'),
    goalId: z.string().min(1),
    updatedAt: z.string().min(1),
    before: exerciseGoalInputSchema,
  }),
]);
export type StoredPlanChange = z.infer<typeof planChangeSchema>;

/** A planned exercise in a proposal: every set listed. */
export type PlanGoal = {
  name: string;
  calories: number;
  notes?: string | null;
  days: number[];
  exerciseSets: ExerciseSet[];
};

/** A change as built, before it's stored. */
export type PlanChange =
  | {operation: 'add'; goal: PlanGoal}
  | {operation: 'update'; goalId: string; updatedAt: string; before: PlanGoal; goal: PlanGoal}
  | {operation: 'remove'; goalId: string; updatedAt: string; before: PlanGoal};

export const planChangeArgsSchema = z.object({
  operation: z.enum(['add', 'update', 'remove']),
  exerciseId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(['TIME', 'STRENGTH']).optional(),
  days: z.array(z.string()).min(1).max(7).optional(),
  sets: z.number().int().min(1).max(MAX_SETS).optional(),
  reps: z.number().int().min(1).max(MAX_REPS).optional(),
  weight: z.number().min(0).max(1000).optional(),
  durationMin: z.number().int().min(1).max(1440).optional(),
  calories: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(EXERCISE_NOTES_MAX).optional(),
});
export type PlanChangeArgs = z.infer<typeof planChangeArgsSchema>;

/** A goal as stored, with the fields a change reads. */
export type CurrentGoal = {
  id: string;
  name: string;
  type: string;
  calories: number;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  setPlan: string | null;
  notes: string | null;
  daysMask: number;
  updatedAt: Date;
};

export function toPlanGoal(goal: CurrentGoal): PlanGoal {
  return {
    name: goal.name,
    calories: goal.calories,
    notes: goal.notes,
    days: maskToDays(goal.daysMask),
    exerciseSets: setsOf(goal),
  };
}

function parseDays(names: readonly string[]): number[] {
  const days = names.map((name) => {
    const key = name.trim().toLowerCase();
    const match = WEEKDAYS.find(
      (day) => day.name.toLowerCase() === key || day.label.toLowerCase() === key,
    );
    if (!match) {
      throw new ToolInputError(`"${name}" is not a weekday. Use Monday to Sunday.`);
    }
    return match.day;
  });
  return maskToDays(daysToMask(days));
}

const cleanSets = (sets: readonly ExerciseSet[]) =>
  sets.map((set) => ({
    reps: set.reps ?? null,
    durationSec: set.durationSec ?? null,
    weight: set.weight ?? null,
  }));

const sameSets = (a: readonly ExerciseSet[], b: readonly ExerciseSet[]) =>
  JSON.stringify(cleanSets(a)) === JSON.stringify(cleanSets(b));

/** The same rep set repeated, or one timed set: what a change can edit field by field. */
function isSimple(sets: readonly ExerciseSet[]) {
  return isUniform(sets) && (isRepSet(sets[0]) || sets.length === 1);
}

function strengthSets(sets?: number | null, reps?: number | null, weight?: number | null) {
  if (sets == null || reps == null) {
    throw new ToolInputError('sets and reps are required for a STRENGTH exercise. Ask the user.');
  }
  return uniformSets(sets, reps, weight || null);
}

function timeSets(durationMin?: number) {
  if (durationMin == null) {
    throw new ToolInputError('durationMin is required for a TIME exercise. Ask the user how long.');
  }
  return [{durationSec: durationMin * 60, weight: null}];
}

/** The sets after a change; the current ones when no set field was given. */
function changedSets(args: PlanChangeArgs, goal: CurrentGoal): ExerciseSet[] {
  const current = setsOf(goal);
  const {type = goal.type, sets, reps, weight, durationMin} = args;
  if (
    args.type === undefined &&
    sets === undefined &&
    reps === undefined &&
    weight === undefined &&
    durationMin === undefined
  ) {
    return current;
  }

  // Sets that differ can only be replaced as a whole.
  if (type === goal.type && !isSimple(current)) {
    if (type === 'TIME' || sets === undefined || reps === undefined || weight === undefined) {
      throw new ToolInputError(
        `"${goal.name}" has different sets (${formatExerciseDetail(goal)}). To replace them all, give sets, reps and weight (0 for none); otherwise tell the user to edit it on the Exercise plan page.`,
      );
    }
    return strengthSets(sets, reps, weight);
  }
  if (type !== goal.type) {
    return type === 'STRENGTH' ? strengthSets(sets, reps, weight) : timeSets(durationMin);
  }

  const [first] = current;
  if (type === 'STRENGTH') {
    return strengthSets(
      sets ?? current.length,
      reps ?? first.reps,
      weight ?? first.weight,
    );
  }
  return durationMin === undefined ? current : timeSets(durationMin);
}

function findGoal(args: PlanChangeArgs, goals: readonly CurrentGoal[]) {
  const goal = args.exerciseId && goals.find((item) => item.id === args.exerciseId);
  if (!goal) {
    throw new ToolInputError(
      'exerciseId must be the id of an exercise in the plan. Call get_exercise_plan for the ids.',
    );
  }
  return goal;
}

function checkNameFree(name: string, goals: readonly CurrentGoal[], exceptId?: string) {
  if (goals.some((goal) => goal.id !== exceptId && isSameExerciseName(goal.name, name))) {
    throw new ToolInputError(
      `"${name}" is already in the plan. Update that exercise instead.`,
    );
  }
}

/**
 * Builds the change a proposal describes from the model's arguments and the
 * user's plan. Throws ToolInputError with a message for the model when the
 * arguments are incomplete. `workChanged` is true when the sets are new or
 * changed, so calories may need estimating.
 */
export function buildPlanChange(
  args: PlanChangeArgs,
  goals: readonly CurrentGoal[],
): {change: PlanChange; workChanged: boolean} {
  if (args.operation === 'add') {
    if (!args.name) throw new ToolInputError('name is required to add an exercise.');
    if (!args.type) throw new ToolInputError('type is required to add an exercise.');
    if (!args.days) {
      throw new ToolInputError('days is required to add an exercise. Ask the user which days.');
    }
    checkNameFree(args.name, goals);
    const goal: PlanGoal = {
      name: args.name,
      calories: args.calories ?? 0,
      notes: normalizeNotes(args.notes),
      days: parseDays(args.days),
      exerciseSets:
        args.type === 'STRENGTH'
          ? strengthSets(args.sets, args.reps, args.weight)
          : timeSets(args.durationMin),
    };
    return {change: {operation: 'add', goal}, workChanged: true};
  }

  const current = findGoal(args, goals);
  const before = toPlanGoal(current);
  const changeOf = {goalId: current.id, updatedAt: current.updatedAt.toISOString(), before};

  if (args.operation === 'remove') {
    return {change: {operation: 'remove', ...changeOf}, workChanged: false};
  }

  if (args.name) checkNameFree(args.name, goals, current.id);
  const goal: PlanGoal = {
    name: args.name ?? before.name,
    calories: args.calories ?? before.calories,
    notes: args.notes === undefined ? before.notes : normalizeNotes(args.notes),
    days: args.days ? parseDays(args.days) : before.days,
    exerciseSets: changedSets(args, current),
  };
  const same = (a: PlanGoal, b: PlanGoal) =>
    JSON.stringify({...a, exerciseSets: cleanSets(a.exerciseSets)}) ===
    JSON.stringify({...b, exerciseSets: cleanSets(b.exerciseSets)});
  if (same(goal, before)) {
    throw new ToolInputError('That is already the plan; nothing would change.');
  }
  return {
    change: {operation: 'update', ...changeOf, goal},
    workChanged: !sameSets(goal.exerciseSets, before.exerciseSets),
  };
}

export function formatDays(days: readonly number[]): string {
  const mask = daysToMask(days);
  if (mask === EVERYDAY_MASK) return 'Every day';
  return WEEKDAYS.filter(({day}) => days.includes(day))
    .map(({label}) => label)
    .join(', ');
}

export function formatPlanSets(sets: readonly ExerciseSet[]): string {
  const detail = formatExerciseDetail({type: 'STRENGTH', exerciseSets: sets});
  return sets.some((set) => set.weight) ? `${detail} kg` : detail;
}

export type PlanChangeRow = {label: string; before?: string; after: string};

/** The fields a change sets, or for an update the ones it changes, as text. */
export function planChangeRows(change: StoredPlanChange): PlanChangeRow[] {
  const describe = (goal: ExerciseGoalInput) => ({
    Days: formatDays(goal.days),
    Sets: formatPlanSets(inputSets(goal)),
    Calories: goal.calories > 0 ? `${goal.calories} kcal` : 'None',
    Notes: goal.notes?.trim() || 'None',
  });
  if (change.operation !== 'update') {
    const goal = change.operation === 'add' ? change.goal : change.before;
    return Object.entries(describe(goal))
      .filter(([, value]) => value !== 'None')
      .map(([label, after]) => ({label, after}));
  }
  const before = {Name: change.before.name, ...describe(change.before)};
  const after = {Name: change.goal.name, ...describe(change.goal)};
  return (Object.keys(after) as (keyof typeof after)[])
    .filter((label) => before[label] !== after[label])
    .map((label) => ({label, before: before[label], after: after[label]}));
}
