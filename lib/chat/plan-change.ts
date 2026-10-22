import {z} from 'zod';
import {
  DEFAULT_BREAK_SEC,
  EXERCISE_NOTES_MAX,
  EVERYDAY_MASK,
  MAX_BREAK_SEC,
  MAX_SEQUENCE_STEPS,
  MAX_SETS,
  SEQUENCE_TYPE,
  WEEKDAYS,
  daysToMask,
  describeSequence,
  exerciseGoalInputSchema,
  formatExerciseDetail,
  goalInputSets,
  isRepSet,
  isSameExerciseName,
  isSequence,
  isUniform,
  maskToDays,
  normalizeNotes,
  parseSequenceSteps,
  setsOf,
  stepSets,
  uniformSets,
  type ExerciseGoalInput,
  type ExerciseSet,
  type SequenceStep,
} from '@/lib/exercise';
import {
  describeAreas,
  exerciseCatalog,
  type Catalog,
  type CatalogEntry,
} from '@/lib/exercise-catalog';
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

/** A planned exercise in a proposal with every set listed, or a sequence. */
export type PlanGoal = {
  name: string;
  notes?: string | null;
  days: number[];
} & (
  | {exerciseSets: ExerciseSet[]}
  | {type: typeof SEQUENCE_TYPE; steps: SequenceStep[]}
);

/** Every set a proposed goal does; a sequence's are labelled by exercise. */
export function planGoalSets(goal: PlanGoal): ExerciseSet[] {
  return 'steps' in goal ? stepSets(goal.steps) : goal.exerciseSets;
}

/** A change as built, before it's stored. */
export type PlanChange =
  | {operation: 'add'; goal: PlanGoal}
  | {operation: 'update'; goalId: string; updatedAt: string; before: PlanGoal; goal: PlanGoal}
  | {operation: 'remove'; goalId: string; updatedAt: string; before: PlanGoal};

export const planChangeArgsSchema = z.object({
  operation: z.enum(['add', 'update', 'remove']),
  exerciseId: z.string().trim().min(1).optional(),
  // Plans only take built-in exercises; the name comes from the entry
  catalogId: z.string().trim().min(1).optional(),
  type: z.enum(['TIME', 'STRENGTH']).optional(),
  days: z.array(z.string()).min(1).max(7).optional(),
  sets: z.number().int().min(1).max(MAX_SETS).optional(),
  reps: z.number().int().min(1).max(MAX_REPS).optional(),
  weight: z.number().min(0).max(1000).optional(),
  durationMin: z.number().int().min(1).max(1440).optional(),
  notes: z.string().max(EXERCISE_NOTES_MAX).optional(),
  // A sequence: several built-in exercises back to back, each step one set
  name: z.string().trim().min(1).max(100).optional(),
  steps: z
    .array(
      z.object({
        catalogId: z.string().trim().min(1),
        reps: z.number().int().min(1).max(MAX_REPS).optional(),
        durationSec: z.number().int().min(1).max(3600).optional(),
        weight: z.number().min(0).max(1000).optional(),
        // The break before this step
        restSec: z.number().int().min(0).max(MAX_BREAK_SEC).optional(),
      }),
    )
    .min(1)
    .max(MAX_SEQUENCE_STEPS)
    .optional(),
});
export type PlanChangeArgs = z.infer<typeof planChangeArgsSchema>;

/** A goal as stored, with the fields a change reads. */
export type CurrentGoal = {
  id: string;
  name: string;
  type: string;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  setPlan: string | null;
  steps: string | null;
  notes: string | null;
  daysMask: number;
  updatedAt: Date;
};

export function toPlanGoal(goal: CurrentGoal): PlanGoal {
  const base = {
    name: goal.name,
    notes: goal.notes,
    days: maskToDays(goal.daysMask),
  };
  const steps = isSequence(goal) ? parseSequenceSteps(goal.steps) : null;
  return steps
    ? {...base, type: SEQUENCE_TYPE, steps}
    : {...base, exerciseSets: setsOf(goal)};
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

/** A goal's work as text, so two goals can be compared. */
const workKey = (goal: PlanGoal) =>
  JSON.stringify(
    'steps' in goal
      ? goal.steps.map((step) => ({
          name: step.name,
          restSec: step.restSec,
          ...cleanSets([step])[0],
        }))
      : cleanSets(goal.exerciseSets),
  );

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

/** A sequence's steps from the model's arguments: built-in exercises only. */
function sequenceSteps(
  steps: NonNullable<PlanChangeArgs['steps']>,
  catalog: Catalog,
): SequenceStep[] {
  return steps.map((step, index) => {
    const entry = findEntry(step.catalogId, catalog);
    if ((step.reps == null) === (step.durationSec == null)) {
      throw new ToolInputError(
        `Step ${index + 1} (${entry.name}) needs either reps or durationSec, not both.`,
      );
    }
    return {
      name: entry.name,
      catalogId: entry.id,
      reps: step.reps ?? null,
      durationSec: step.reps == null ? (step.durationSec ?? null) : null,
      weight: step.weight || null,
      restSec: index === 0 ? 0 : (step.restSec ?? DEFAULT_BREAK_SEC),
    };
  });
}

/** The built-in exercise a change names; the coach can't plan anything else. */
function findEntry(catalogId: string | undefined, catalog: Catalog): CatalogEntry {
  const entry = catalog.get(catalogId);
  if (!entry || entry.retired) {
    throw new ToolInputError(
      catalogId
        ? `"${catalogId}" is not in the built-in exercise list. Call search_exercise_catalog for ids.`
        : "Only exercises from the built-in list can be added. Call search_exercise_catalog for the catalogId. If nothing fits, tell the user it isn't available yet and that they can add it themselves on the Exercise plan page.",
    );
  }
  return entry;
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
 * arguments are incomplete.
 */
export function buildPlanChange(
  args: PlanChangeArgs,
  goals: readonly CurrentGoal[],
  catalog: Catalog = exerciseCatalog,
): PlanChange {
  if (args.operation === 'add' && args.steps) {
    if (!args.name) {
      throw new ToolInputError(
        'name is required to add a sequence. Suggest a short one, e.g. "Cardio circuit".',
      );
    }
    if (!args.days) {
      throw new ToolInputError('days is required to add a sequence. Ask the user which days.');
    }
    checkNameFree(args.name, goals);
    const goal: PlanGoal = {
      name: args.name,
      notes: normalizeNotes(args.notes),
      days: parseDays(args.days),
      type: SEQUENCE_TYPE,
      steps: sequenceSteps(args.steps, catalog),
    };
    return {operation: 'add', goal};
  }

  if (args.operation === 'add') {
    const entry = findEntry(args.catalogId, catalog);
    if (!args.days) {
      throw new ToolInputError('days is required to add an exercise. Ask the user which days.');
    }
    checkNameFree(entry.name, goals);
    const type = args.type ?? entry.type;
    const goal: PlanGoal = {
      name: entry.name,
      notes: normalizeNotes(args.notes),
      days: parseDays(args.days),
      exerciseSets:
        type === 'STRENGTH'
          ? strengthSets(args.sets, args.reps, args.weight)
          : timeSets(args.durationMin),
    };
    return {operation: 'add', goal};
  }

  const current = findGoal(args, goals);
  const before = toPlanGoal(current);
  const changeOf = {goalId: current.id, updatedAt: current.updatedAt.toISOString(), before};

  if (args.operation === 'remove') {
    return {operation: 'remove', ...changeOf};
  }

  const shared = {
    notes: args.notes === undefined ? before.notes : normalizeNotes(args.notes),
    days: args.days ? parseDays(args.days) : before.days,
  };
  let goal: PlanGoal;
  if ('steps' in before) {
    const {catalogId, type, sets, reps, weight, durationMin} = args;
    if ([catalogId, type, sets, reps, weight, durationMin].some((value) => value !== undefined)) {
      throw new ToolInputError(
        `"${before.name}" is a sequence. To change its exercises, pass the full steps list.`,
      );
    }
    const name = args.name ?? before.name;
    if (name !== before.name) checkNameFree(name, goals, current.id);
    goal = {
      name,
      ...shared,
      type: SEQUENCE_TYPE,
      steps: args.steps ? sequenceSteps(args.steps, catalog) : before.steps,
    };
  } else {
    if (args.steps) {
      throw new ToolInputError(
        `"${before.name}" is a single exercise. To turn it into a sequence, remove it and add a sequence.`,
      );
    }
    // Linking to a built-in exercise renames it to the entry's name.
    const name = args.catalogId ? findEntry(args.catalogId, catalog).name : before.name;
    if (name !== before.name) checkNameFree(name, goals, current.id);
    goal = {name, ...shared, exerciseSets: changedSets(args, current)};
  }
  const details = ({name, notes, days}: PlanGoal) =>
    JSON.stringify({name, notes, days});
  if (workKey(goal) === workKey(before) && details(goal) === details(before)) {
    throw new ToolInputError('That is already the plan; nothing would change.');
  }
  return {operation: 'update', ...changeOf, goal};
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

/** `lines`, when given, lists `after` one item per line, e.g. a sequence's steps. */
export type PlanChangeRow = {
  label: string;
  before?: string;
  after: string;
  lines?: string[];
};

/** The fields a change sets, or for an update the ones it changes, as text. */
export function planChangeRows(
  change: StoredPlanChange,
  catalog: Catalog = exerciseCatalog,
): PlanChangeRow[] {
  const areas = (goal: ExerciseGoalInput) => {
    const entries =
      'steps' in goal
        ? goal.steps.flatMap((step) => catalog.get(step.catalogId) ?? [])
        : [catalog.linkFor(goal.name) ?? []].flat();
    const names = new Set(entries.flatMap((entry) => describeAreas(entry).primary));
    return names.size > 0 ? [...names].join(', ') : 'None';
  };
  // A sequence lists its steps where an exercise lists its sets.
  const describe = (goal: ExerciseGoalInput): Record<string, string> => ({
    Areas: areas(goal),
    Days: formatDays(goal.days),
    ...('steps' in goal
      ? {Steps: describeSequence(goal.steps).join(' · ')}
      : {Sets: formatPlanSets(goalInputSets(goal))}),
    Notes: goal.notes?.trim() || 'None',
  });
  const linesFor = (goal: ExerciseGoalInput, label: string) =>
    label === 'Steps' && 'steps' in goal ? {lines: describeSequence(goal.steps)} : {};
  if (change.operation !== 'update') {
    const goal = change.operation === 'add' ? change.goal : change.before;
    return Object.entries(describe(goal))
      .filter(([, value]) => value !== 'None')
      .map(([label, after]) => ({label, after, ...linesFor(goal, label)}));
  }
  const before: Record<string, string> = {Name: change.before.name, ...describe(change.before)};
  const after: Record<string, string> = {Name: change.goal.name, ...describe(change.goal)};
  return Object.keys(after)
    .filter((label) => before[label] !== after[label])
    .map((label) => ({
      label,
      before: before[label],
      after: after[label],
      ...linesFor(change.goal, label),
    }));
}

/**
 * Several exercises in the plan linked to built-in ones at once, as a chat
 * action stores it. Each link renames the goal; `updatedAt` lets confirm
 * refuse a goal edited since.
 */
export const catalogLinksSchema = z.object({
  links: z
    .array(
      z.object({
        goalId: z.string().min(1),
        updatedAt: z.string().min(1),
        before: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .min(1),
});
export type StoredCatalogLinks = z.infer<typeof catalogLinksSchema>;

export const catalogLinksArgsSchema = z.object({
  links: z
    .array(
      z.object({
        exerciseId: z.string().trim().min(1),
        catalogId: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(30),
});
export type CatalogLinksArgs = z.infer<typeof catalogLinksArgsSchema>;

/** Builds a links proposal, refusing renames that would clash in the plan. */
export function buildCatalogLinks(
  args: CatalogLinksArgs,
  goals: readonly CurrentGoal[],
  catalog: Catalog = exerciseCatalog,
): StoredCatalogLinks {
  const links = args.links.map(({exerciseId, catalogId}) => {
    const goal = findGoal({operation: 'update', exerciseId}, goals);
    if (isSequence(goal)) {
      throw new ToolInputError(
        `"${goal.name}" is a sequence; its steps are already built-in exercises.`,
      );
    }
    return {
      goalId: goal.id,
      updatedAt: goal.updatedAt.toISOString(),
      before: goal.name,
      name: findEntry(catalogId, catalog).name,
    };
  });
  if (new Set(links.map((link) => link.goalId)).size !== links.length) {
    throw new ToolInputError('Each exercise can only be linked once.');
  }
  const changed = links.filter((link) => link.before !== link.name);
  if (changed.length === 0) {
    throw new ToolInputError('Those exercises are already linked; nothing would change.');
  }
  const nameAfter = (goal: CurrentGoal) =>
    changed.find((link) => link.goalId === goal.id)?.name ?? goal.name;
  for (const link of changed) {
    const clash = goals.find(
      (goal) => goal.id !== link.goalId && isSameExerciseName(nameAfter(goal), link.name),
    );
    if (clash) {
      throw new ToolInputError(
        `"${link.before}" and "${clash.name}" would both be "${link.name}". Link only one, or suggest removing the other.`,
      );
    }
  }
  return {links: changed};
}
