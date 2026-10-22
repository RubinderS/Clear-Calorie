import assert from 'node:assert/strict';
import {test} from 'node:test';
import {daysToMask} from '@/lib/exercise';
import {createCatalog, type CatalogSource} from '@/lib/exercise-catalog';
import {ToolInputError} from './helpers';
import {
  buildCatalogLinks,
  buildPlanChange,
  catalogLinksSchema,
  planChangeRows,
  planChangeSchema,
  planGoalSets,
  type CurrentGoal,
} from './plan-change';

function entry(id: string, name: string, overrides: Partial<CatalogSource> = {}): CatalogSource {
  return {
    config: {
      id,
      name,
      view: 'side',
      equipment: [],
      phases: [{name: 'lift', durationMs: 1000, from: 0, to: 1, cue: 'Lift'}],
      formTips: [],
      commonMistakes: [],
    },
    type: 'STRENGTH',
    areas: {primary: ['chest']},
    ...overrides,
  };
}

const catalog = createCatalog([
  entry('barbell-back-squat', 'Barbell back squat', {areas: {primary: ['quads', 'glutes']}}),
  entry('bench-press', 'Bench press'),
  entry('swimming', 'Swimming', {type: 'TIME', areas: {primary: ['cardio']}}),
  entry('old-row', 'Old row', {retired: true}),
]);

const updatedAt = new Date('2026-10-01T00:00:00.000Z');

function goal(overrides: Partial<CurrentGoal> = {}): CurrentGoal {
  return {
    id: 'bench',
    name: 'Bench press',
    type: 'STRENGTH',
    durationMin: null,
    sets: 3,
    reps: 8,
    weight: 60,
    steps: null,
    setPlan: JSON.stringify([
      {reps: 8, weight: 60},
      {reps: 8, weight: 60},
      {reps: 8, weight: 60},
    ]),
    notes: null,
    daysMask: daysToMask([1, 4]),
    updatedAt,
    ...overrides,
  };
}

const run = goal({
  id: 'run',
  name: 'Running',
  type: 'TIME',
  durationMin: 30,
  sets: 1,
  reps: null,
  weight: null,
  setPlan: JSON.stringify([{durationSec: 1800, weight: null}]),
  daysMask: daysToMask([2]),
});

test('adds a built-in exercise with uniform sets on the given days', () => {
  const change = buildPlanChange(
    {operation: 'add', catalogId: 'barbell-back-squat', days: ['Monday', 'fri'], sets: 5, reps: 5, weight: 80},
    [goal()],
    catalog,
  );
  assert.ok(change.operation === 'add');
  assert.equal(change.goal.name, 'Barbell back squat');
  assert.deepEqual(change.goal.days, [1, 5]);
  assert.equal(planGoalSets(change.goal).length, 5);
  assert.deepEqual(planGoalSets(change.goal)[0], {reps: 5, weight: 80});
  assert.ok(planChangeSchema.safeParse(change).success);
  assert.deepEqual(planChangeRows(change, catalog)[0], {label: 'Areas', after: 'Quads, Glutes'});
});

test('takes the type from the entry when adding', () => {
  const change = buildPlanChange(
    {operation: 'add', catalogId: 'swimming', days: ['Tuesday'], durationMin: 20},
    [],
    catalog,
  );
  assert.ok(change.operation === 'add');
  assert.deepEqual(planGoalSets(change.goal), [{durationSec: 1200, weight: null}]);
});

test('only adds built-in exercises', () => {
  assert.throws(
    () => buildPlanChange({operation: 'add', days: ['Monday'], sets: 3, reps: 8}, [], catalog),
    /Only exercises from the built-in list/,
  );
  assert.throws(
    () => buildPlanChange({operation: 'add', catalogId: 'made-up', days: ['Monday'], sets: 3, reps: 8}, [], catalog),
    /not in the built-in exercise list/,
  );
  assert.throws(
    () => buildPlanChange({operation: 'add', catalogId: 'old-row', days: ['Monday'], sets: 3, reps: 8}, [], catalog),
    /not in the built-in exercise list/,
  );
});

test('refuses to add without days, or with a name already planned', () => {
  assert.throws(
    () => buildPlanChange({operation: 'add', catalogId: 'barbell-back-squat', sets: 5, reps: 5}, [], catalog),
    /days is required/,
  );
  assert.throws(
    () =>
      buildPlanChange(
        {operation: 'add', catalogId: 'bench-press', days: ['Monday'], sets: 3, reps: 8},
        [goal()],
        catalog,
      ),
    /already in the plan/,
  );
  assert.throws(
    () => buildPlanChange({operation: 'add', catalogId: 'swimming', days: ['Funday'], durationMin: 20}, [], catalog),
    ToolInputError,
  );
});

test('linking renames to the built-in name without changing the work', () => {
  const change = buildPlanChange(
    {operation: 'update', exerciseId: 'bench', catalogId: 'barbell-back-squat'},
    [goal({name: 'Squats'})],
    catalog,
  );
  assert.ok(change.operation === 'update');
  assert.equal(change.goal.name, 'Barbell back squat');
  assert.deepEqual(planChangeRows(change, catalog).slice(0, 2), [
    {label: 'Name', before: 'Squats', after: 'Barbell back squat'},
    {label: 'Areas', before: 'None', after: 'Quads, Glutes'},
  ]);
  assert.throws(
    () =>
      buildPlanChange(
        {operation: 'update', exerciseId: 'run', catalogId: 'bench-press'},
        [goal(), run],
        catalog,
      ),
    /already in the plan/,
  );
});

test('updates only the fields given, keeping the rest', () => {
  const change = buildPlanChange(
    {operation: 'update', exerciseId: 'bench', weight: 62.5},
    [goal()],
  );
  assert.ok(change.operation === 'update');
  assert.equal(change.updatedAt, updatedAt.toISOString());
  assert.deepEqual(change.goal.days, [1, 4]);
  assert.deepEqual(
    planGoalSets(change.goal),
    [1, 2, 3].map(() => ({reps: 8, weight: 62.5})),
  );
  assert.deepEqual(planChangeRows(change), [
    {label: 'Sets', before: '3 × 8 @ 60 kg', after: '3 × 8 @ 62.5 kg'},
  ]);
});

test('changing days alone leaves the sets as they are', () => {
  const change = buildPlanChange(
    {operation: 'update', exerciseId: 'run', days: ['Tuesday', 'Thursday']},
    [goal(), run],
  );
  assert.deepEqual(planChangeRows(change), [
    {label: 'Days', before: 'Tue', after: 'Tue, Thu'},
  ]);
});

test('weight 0 clears the load', () => {
  const change = buildPlanChange({operation: 'update', exerciseId: 'bench', weight: 0}, [goal()]);
  assert.ok(change.operation === 'update');
  assert.equal(planGoalSets(change.goal)[0].weight, null);
});

test('a plan with different sets is only replaced as a whole', () => {
  const pyramid = goal({
    steps: null,
    setPlan: JSON.stringify([
      {reps: 10, weight: 50},
      {reps: 8, weight: 60},
      {reps: 6, weight: 70},
    ]),
  });
  assert.throws(
    () => buildPlanChange({operation: 'update', exerciseId: 'bench', weight: 65}, [pyramid]),
    /has different sets/,
  );
  const change = buildPlanChange(
    {operation: 'update', exerciseId: 'bench', sets: 3, reps: 8, weight: 65},
    [pyramid],
  );
  assert.ok(change.operation === 'update');
  assert.equal(planGoalSets(change.goal).length, 3);
  // Notes and days changes don't touch the sets.
  const notes = buildPlanChange({operation: 'update', exerciseId: 'bench', notes: 'Pause reps'}, [pyramid]);
  assert.ok(notes.operation === 'update');
  assert.deepEqual(planGoalSets(notes.goal), planGoalSets(notes.before));
});

test('switching type needs the new type\'s fields', () => {
  assert.throws(
    () => buildPlanChange({operation: 'update', exerciseId: 'run', type: 'STRENGTH'}, [run]),
    /sets and reps are required/,
  );
});

test('refuses an unknown id or a change that changes nothing', () => {
  assert.throws(
    () => buildPlanChange({operation: 'remove', exerciseId: 'nope'}, [goal()]),
    /get_exercise_plan/,
  );
  assert.throws(
    () => buildPlanChange({operation: 'update', exerciseId: 'bench', weight: 60}, [goal()]),
    /nothing would change/,
  );
});

test('removes with the goal as it was', () => {
  const change = buildPlanChange({operation: 'remove', exerciseId: 'bench'}, [goal({notes: 'Arch'})]);
  assert.ok(change.operation === 'remove');
  assert.equal(change.goalId, 'bench');
  assert.deepEqual(planChangeRows(change), [
    {label: 'Days', after: 'Mon, Thu'},
    {label: 'Sets', after: '3 × 8 @ 60 kg'},
    {label: 'Notes', after: 'Arch'},
  ]);
});

test('links several exercises at once, skipping ones already linked', () => {
  const {links} = buildCatalogLinks(
    {
      links: [
        {exerciseId: 'run', catalogId: 'swimming'},
        {exerciseId: 'bench', catalogId: 'bench-press'},
      ],
    },
    [goal(), run],
    catalog,
  );
  assert.deepEqual(links, [
    {goalId: 'run', updatedAt: updatedAt.toISOString(), before: 'Running', name: 'Swimming'},
  ]);
  assert.ok(catalogLinksSchema.safeParse({links}).success);
});

test('refuses links that clash, repeat or change nothing', () => {
  const squats = goal({id: 'a', name: 'Squats'});
  const backSquat = goal({id: 'b', name: 'Back squat'});
  assert.throws(
    () =>
      buildCatalogLinks(
        {
          links: [
            {exerciseId: 'a', catalogId: 'barbell-back-squat'},
            {exerciseId: 'b', catalogId: 'barbell-back-squat'},
          ],
        },
        [squats, backSquat],
        catalog,
      ),
    /would both be "Barbell back squat"/,
  );
  assert.throws(
    () =>
      buildCatalogLinks(
        {links: [{exerciseId: 'a', catalogId: 'swimming'}, {exerciseId: 'a', catalogId: 'swimming'}]},
        [squats],
        catalog,
      ),
    /only be linked once/,
  );
  assert.throws(
    () => buildCatalogLinks({links: [{exerciseId: 'bench', catalogId: 'bench-press'}]}, [goal()], catalog),
    /nothing would change/,
  );
  assert.throws(
    () => buildCatalogLinks({links: [{exerciseId: 'bench', catalogId: 'nope'}]}, [goal()], catalog),
    /search_exercise_catalog/,
  );
});

const circuitArgs = {
  operation: 'add' as const,
  name: 'Cardio circuit',
  days: ['Monday'],
  steps: [
    {catalogId: 'swimming', durationSec: 60, restSec: 30},
    {catalogId: 'barbell-back-squat', reps: 10},
    {catalogId: 'bench-press', reps: 8, restSec: 0},
  ],
};

test('adds a sequence of built-in exercises in one change', () => {
  const change = buildPlanChange(circuitArgs, [], catalog);
  assert.ok(change.operation === 'add' && 'steps' in change.goal);
  assert.deepEqual(
    change.goal.steps.map((step) => [step.name, step.restSec]),
    [
      ['Swimming', 0],
      ['Barbell back squat', 60],
      ['Bench press', 0],
    ],
  );
  assert.equal(planGoalSets(change.goal).length, 3);
  assert.ok(planChangeSchema.safeParse(change).success);
  const steps = planChangeRows(change, catalog).find((row) => row.label === 'Steps');
  assert.deepEqual(steps?.lines, [
    '1. Swimming · 1 min',
    'Break 1 min',
    '2. Barbell back squat · 10 reps',
    '3. Bench press · 8 reps',
  ]);
});

test('a sequence needs a name, days and built-in steps with reps or a time', () => {
  const fails = (args: object) =>
    assert.throws(() => buildPlanChange({...circuitArgs, ...args}, [], catalog), ToolInputError);
  fails({name: undefined});
  fails({days: undefined});
  fails({steps: [{catalogId: 'made-up', reps: 10}]});
  fails({steps: [{catalogId: 'old-row', reps: 10}]});
  fails({steps: [{catalogId: 'swimming'}]});
  fails({steps: [{catalogId: 'swimming', reps: 10, durationSec: 60}]});
});

function sequenceGoal(): CurrentGoal {
  const change = buildPlanChange(circuitArgs, [], catalog);
  assert.ok(change.operation === 'add' && 'steps' in change.goal);
  return goal({
    id: 'circuit',
    name: 'Cardio circuit',
    type: 'SEQUENCE',
    setPlan: null,
    steps: JSON.stringify(change.goal.steps),
    daysMask: daysToMask([1]),
  });
}

test('updates a sequence as a whole and only through its steps', () => {
  const current = sequenceGoal();
  const change = buildPlanChange(
    {
      operation: 'update',
      exerciseId: 'circuit',
      steps: [{catalogId: 'swimming', durationSec: 120}],
    },
    [current],
    catalog,
  );
  assert.ok(change.operation === 'update' && 'steps' in change.goal);
  assert.equal(change.goal.steps.length, 1);
  assert.ok(planChangeSchema.safeParse(change).success);

  const days = buildPlanChange(
    {operation: 'update', exerciseId: 'circuit', days: ['Friday']},
    [current],
    catalog,
  );
  assert.ok(days.operation === 'update' && 'steps' in days.goal);
  assert.equal(days.goal.steps.length, 3);

  assert.throws(
    () => buildPlanChange({operation: 'update', exerciseId: 'circuit', reps: 12}, [current], catalog),
    ToolInputError,
  );
  assert.throws(
    () =>
      buildPlanChange(
        {operation: 'update', exerciseId: 'bench', steps: [{catalogId: 'swimming', durationSec: 60}]},
        [goal()],
        catalog,
      ),
    ToolInputError,
  );
  assert.throws(
    () => buildCatalogLinks({links: [{exerciseId: 'circuit', catalogId: 'swimming'}]}, [current], catalog),
    ToolInputError,
  );
});
