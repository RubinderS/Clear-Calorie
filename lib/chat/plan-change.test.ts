import assert from 'node:assert/strict';
import {test} from 'node:test';
import {daysToMask} from '@/lib/exercise';
import {ToolInputError} from './helpers';
import {
  buildPlanChange,
  planChangeRows,
  planChangeSchema,
  type CurrentGoal,
} from './plan-change';

const updatedAt = new Date('2026-10-01T00:00:00.000Z');

function goal(overrides: Partial<CurrentGoal> = {}): CurrentGoal {
  return {
    id: 'bench',
    name: 'Bench press',
    type: 'STRENGTH',
    calories: 0,
    durationMin: null,
    sets: 3,
    reps: 8,
    weight: 60,
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

test('adds an exercise with uniform sets on the given days', () => {
  const {change, workChanged} = buildPlanChange(
    {operation: 'add', name: 'Squat', type: 'STRENGTH', days: ['Monday', 'fri'], sets: 5, reps: 5, weight: 80},
    [goal()],
  );
  assert.equal(workChanged, true);
  assert.equal(change.operation, 'add');
  assert.ok(change.operation === 'add');
  assert.deepEqual(change.goal.days, [1, 5]);
  assert.equal(change.goal.exerciseSets.length, 5);
  assert.deepEqual(change.goal.exerciseSets[0], {reps: 5, weight: 80});
  assert.ok(planChangeSchema.safeParse(change).success);
});

test('refuses to add without days, or with a name already planned', () => {
  assert.throws(
    () => buildPlanChange({operation: 'add', name: 'Squat', type: 'STRENGTH', sets: 5, reps: 5}, []),
    /days is required/,
  );
  assert.throws(
    () =>
      buildPlanChange(
        {operation: 'add', name: 'bench press', type: 'STRENGTH', days: ['Monday'], sets: 3, reps: 8},
        [goal()],
      ),
    /already in the plan/,
  );
  assert.throws(
    () => buildPlanChange({operation: 'add', name: 'Swim', type: 'TIME', days: ['Funday']}, []),
    ToolInputError,
  );
});

test('updates only the fields given, keeping the rest', () => {
  const {change, workChanged} = buildPlanChange(
    {operation: 'update', exerciseId: 'bench', weight: 62.5},
    [goal()],
  );
  assert.ok(change.operation === 'update');
  assert.equal(workChanged, true);
  assert.equal(change.updatedAt, updatedAt.toISOString());
  assert.deepEqual(change.goal.days, [1, 4]);
  assert.deepEqual(
    change.goal.exerciseSets,
    [1, 2, 3].map(() => ({reps: 8, weight: 62.5})),
  );
  assert.deepEqual(planChangeRows(change), [
    {label: 'Sets', before: '3 × 8 @ 60 kg', after: '3 × 8 @ 62.5 kg'},
  ]);
});

test('changing days alone leaves the sets as they are', () => {
  const {change, workChanged} = buildPlanChange(
    {operation: 'update', exerciseId: 'run', days: ['Tuesday', 'Thursday']},
    [goal(), run],
  );
  assert.equal(workChanged, false);
  assert.deepEqual(planChangeRows(change), [
    {label: 'Days', before: 'Tue', after: 'Tue, Thu'},
  ]);
});

test('weight 0 clears the load', () => {
  const {change} = buildPlanChange({operation: 'update', exerciseId: 'bench', weight: 0}, [goal()]);
  assert.ok(change.operation === 'update');
  assert.equal(change.goal.exerciseSets[0].weight, null);
});

test('a plan with different sets is only replaced as a whole', () => {
  const pyramid = goal({
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
  const {change} = buildPlanChange(
    {operation: 'update', exerciseId: 'bench', sets: 3, reps: 8, weight: 65},
    [pyramid],
  );
  assert.ok(change.operation === 'update');
  assert.equal(change.goal.exerciseSets.length, 3);
  // Notes and days changes don't touch the sets.
  const notes = buildPlanChange({operation: 'update', exerciseId: 'bench', notes: 'Pause reps'}, [pyramid]);
  assert.equal(notes.workChanged, false);
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
  const {change} = buildPlanChange({operation: 'remove', exerciseId: 'bench'}, [goal({notes: 'Arch'})]);
  assert.ok(change.operation === 'remove');
  assert.equal(change.goalId, 'bench');
  assert.deepEqual(planChangeRows(change), [
    {label: 'Days', after: 'Mon, Thu'},
    {label: 'Sets', after: '3 × 8 @ 60 kg'},
    {label: 'Notes', after: 'Arch'},
  ]);
});
