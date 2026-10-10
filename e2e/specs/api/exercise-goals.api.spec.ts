import {test, expect} from '../../fixtures/test';
import {seedExerciseGoal} from '../../fixtures/db';
import {daysAgoIn, todayIn, weekdayIn} from '../../fixtures/dates';
import {daysToMask} from '../../../lib/exercise';

const GOAL = {
  name: 'Goblet squats',
  type: 'STRENGTH',
  sets: 3,
  reps: 12,
  weight: 16,
  calories: 90,
  days: [1, 3, 5],
};

test('EP-02 POST creates a goal with a weekday mask', async ({api, user, db}) => {
  const response = await api.post('/api/exercise-goals', {
    data: {...GOAL, notes: '  Heels down  '},
  });
  expect(response.status()).toBe(201);
  const goal = await response.json();
  expect(goal).toMatchObject({
    userId: user.id,
    name: 'Goblet squats',
    type: 'STRENGTH',
    sets: 3,
    reps: 12,
    weight: 16,
    durationMin: null,
    calories: 90,
    notes: 'Heels down',
    tempoMs: null,
    daysMask: daysToMask([1, 3, 5]),
  });
  expect(await db.exerciseGoal.count({where: {userId: user.id}})).toBe(1);
});

test('EP-03 calories default to 0 and blank notes become null', async ({api}) => {
  const response = await api.post('/api/exercise-goals', {
    data: {name: 'Walk', type: 'TIME', durationMin: 20, days: [0], notes: '   '},
  });
  expect(await response.json()).toMatchObject({
    calories: 0,
    notes: null,
    durationMin: 20,
    sets: null,
  });
});

test('EP-07 POST with id updates the goal', async ({api, db, user}) => {
  const goal = await seedExerciseGoal(db, user.id, {name: 'Old name'});
  const response = await api.post('/api/exercise-goals', {
    data: {...GOAL, id: goal.id, name: 'New name', days: [2]},
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    id: goal.id,
    name: 'New name',
    daysMask: daysToMask([2]),
  });
});

test('EP-A GET lists goals oldest first', async ({api, db, user}) => {
  await seedExerciseGoal(db, user.id, {
    name: 'Second',
    createdAt: new Date(Date.now() - 1000),
  });
  await seedExerciseGoal(db, user.id, {
    name: 'First',
    createdAt: new Date(Date.now() - 5000),
  });
  const goals = await (await api.get('/api/exercise-goals')).json();
  expect(goals.map((g: {name: string}) => g.name)).toEqual(['First', 'Second']);
});

test.describe('GO-01 POST validation', () => {
  const invalid: [string, Record<string, unknown>][] = [
    ['no days', {...GOAL, days: []}],
    ['duplicate days', {...GOAL, days: [1, 1]}],
    ['day 7', {...GOAL, days: [7]}],
    ['name over 100 chars', {...GOAL, name: 'x'.repeat(101)}],
    ['notes over 500 chars', {...GOAL, notes: 'x'.repeat(501)}],
    ['bad type', {...GOAL, type: 'CARDIO'}],
    ['reps over 100', {...GOAL, reps: 101}],
  ];
  for (const [label, data] of invalid) {
    test(`${label} → 400`, async ({api}) => {
      const response = await api.post('/api/exercise-goals', {data});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }
});

test('GO-02 unknown goal → 404 for update, settings and delete', async ({api}) => {
  const update = await api.post('/api/exercise-goals', {data: {...GOAL, id: 'nope'}});
  expect(update.status()).toBe(404);
  expect(await update.json()).toEqual({error: 'Goal not found'});
  expect(
    (await api.patch('/api/exercise-goals', {data: {id: 'nope', tempoMs: 2000}})).status(),
  ).toBe(404);
  expect((await api.delete('/api/exercise-goals?id=nope')).status()).toBe(404);
  expect((await api.delete('/api/exercise-goals')).status()).toBe(400);
});

test.describe('GO-03 PATCH workout settings', () => {
  test('saves tempo and notes without touching the plan', async ({api, db, user}) => {
    const goal = await seedExerciseGoal(db, user.id, {notes: 'Old'});

    const tempo = await api.patch('/api/exercise-goals', {
      data: {id: goal.id, tempoMs: 2500},
    });
    expect(tempo.status()).toBe(204);
    expect(await db.exerciseGoal.findUnique({where: {id: goal.id}})).toMatchObject({
      tempoMs: 2500,
      notes: 'Old',
    });

    const notes = await api.patch('/api/exercise-goals', {
      data: {id: goal.id, notes: '  '},
    });
    expect(notes.status()).toBe(204);
    expect(await db.exerciseGoal.findUnique({where: {id: goal.id}})).toMatchObject({
      tempoMs: 2500,
      notes: null,
    });
  });

  for (const [label, data] of [
    ['tempo below 1s', {tempoMs: 500}],
    ['tempo above 6s', {tempoMs: 7000}],
    ['decimal tempo', {tempoMs: 1500.5}],
    ['neither field', {}],
  ] as const) {
    test(`${label} → 400`, async ({api, db, user}) => {
      const goal = await seedExerciseGoal(db, user.id);
      const response = await api.patch('/api/exercise-goals', {
        data: {id: goal.id, ...data},
      });
      expect(response.status()).toBe(400);
    });
  }
});

test('EP-09 DELETE removes the goal', async ({api, db, user}) => {
  const goal = await seedExerciseGoal(db, user.id);
  expect((await api.delete(`/api/exercise-goals?id=${goal.id}`)).status()).toBe(204);
  expect(await db.exerciseGoal.count({where: {id: goal.id}})).toBe(0);
});

test('GO-04 changing the plan freezes past days only', async ({api, db, user}) => {
  // Created three days ago, planned every day.
  await seedExerciseGoal(db, user.id, {
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  });

  await api.post('/api/exercise-goals', {data: GOAL});

  const frozen = await db.exercisePlanDay.findMany({
    where: {userId: user.id},
    orderBy: {date: 'asc'},
  });
  const dates = frozen.map((day) => day.date);
  expect(dates).toEqual([daysAgoIn(3), daysAgoIn(2), daysAgoIn(1)]);
  expect(dates).not.toContain(todayIn());
  // The new goal didn't exist on those days, so each counts only the old one.
  expect(frozen.every((day) => day.plannedCount === 1)).toBe(true);

  // Further changes don't duplicate snapshots.
  await api.post('/api/exercise-goals', {data: {...GOAL, name: 'Another'}});
  expect(await db.exercisePlanDay.count({where: {userId: user.id}})).toBe(3);
});

test('GO-05 deleting a goal keeps its ticked logs', async ({api, db, user}) => {
  const goal = await seedExerciseGoal(db, user.id);
  const tick = await (
    await api.post('/api/exercise-goals/log', {data: {goalId: goal.id}})
  ).json();

  await api.delete(`/api/exercise-goals?id=${goal.id}`);

  const log = await db.exerciseLog.findUnique({where: {id: tick.id}});
  expect(log).toMatchObject({exerciseGoalId: null, goalDate: todayIn()});
});

test.describe('Ticking planned exercises', () => {
  test('TP-03 tick copies the goal into today’s log', async ({api, db, user}) => {
    const goal = await seedExerciseGoal(db, user.id, {
      name: 'Push-ups',
      calories: 40,
      sets: 3,
      reps: 15,
      weight: null,
    });
    const response = await api.post('/api/exercise-goals/log', {
      data: {goalId: goal.id},
    });
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({
      userId: user.id,
      exerciseGoalId: goal.id,
      goalDate: todayIn(),
      name: 'Push-ups',
      type: 'STRENGTH',
      calories: 40,
      sets: 3,
      reps: 15,
      durationMin: 0,
    });
  });

  test('TP-05 ticking twice is idempotent', async ({api, db, user}) => {
    const goal = await seedExerciseGoal(db, user.id);
    const first = await api.post('/api/exercise-goals/log', {data: {goalId: goal.id}});
    const second = await api.post('/api/exercise-goals/log', {data: {goalId: goal.id}});
    expect(first.status()).toBe(201);
    expect(second.status()).toBe(200);
    expect((await second.json()).id).toBe((await first.json()).id);
    expect(await db.exerciseLog.count({where: {exerciseGoalId: goal.id}})).toBe(1);
  });

  test('TP-06 untick removes today’s log', async ({api, db, user}) => {
    const goal = await seedExerciseGoal(db, user.id);
    await api.post('/api/exercise-goals/log', {data: {goalId: goal.id}});

    const untick = await api.delete(`/api/exercise-goals/log?goalId=${goal.id}`);
    expect(untick.status()).toBe(204);
    expect(await db.exerciseLog.count({where: {exerciseGoalId: goal.id}})).toBe(0);

    const again = await api.delete(`/api/exercise-goals/log?goalId=${goal.id}`);
    expect(again.status()).toBe(404);
    expect(await again.json()).toEqual({error: 'Entry not found'});
    expect((await api.delete('/api/exercise-goals/log')).status()).toBe(400);
  });

  test('TP-07 goals not planned today or unknown are rejected', async ({
    api,
    db,
    user,
  }) => {
    const tomorrowOnly = await seedExerciseGoal(db, user.id, {
      days: [(weekdayIn() + 1) % 7],
    });
    const notToday = await api.post('/api/exercise-goals/log', {
      data: {goalId: tomorrowOnly.id},
    });
    expect(notToday.status()).toBe(400);
    expect(await notToday.json()).toEqual({
      error: 'This exercise is not planned for today',
    });

    const unknown = await api.post('/api/exercise-goals/log', {data: {goalId: 'nope'}});
    expect(unknown.status()).toBe(404);
    expect((await api.post('/api/exercise-goals/log', {data: {}})).status()).toBe(400);
  });

  test('TP-08 workout overrides apply to strength goals only', async ({
    api,
    db,
    user,
  }) => {
    const strength = await seedExerciseGoal(db, user.id, {sets: 3, reps: 10});
    const tick = await api.post('/api/exercise-goals/log', {
      data: {goalId: strength.id, sets: 2, reps: 8},
    });
    expect(await tick.json()).toMatchObject({sets: 2, reps: 8});

    const time = await seedExerciseGoal(db, user.id, {
      name: 'Cycle',
      type: 'TIME',
      durationMin: 20,
      sets: null,
      reps: null,
    });
    const timeTick = await api.post('/api/exercise-goals/log', {
      data: {goalId: time.id, sets: 5, reps: 5},
    });
    expect(await timeTick.json()).toMatchObject({sets: null, reps: null, durationMin: 20});

    const tooMany = await seedExerciseGoal(db, user.id, {name: 'Curls'});
    const invalid = await api.post('/api/exercise-goals/log', {
      data: {goalId: tooMany.id, reps: 101},
    });
    expect(invalid.status()).toBe(400);
  });
});
