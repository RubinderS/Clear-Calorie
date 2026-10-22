import {test, expect} from '../../fixtures/test';
import {seedExercise, seedExerciseGoal} from '../../fixtures/db';
import {daysAgoIn, noonDaysAgo, todayIn, weekdayIn} from '../../fixtures/dates';

const STRENGTH = {
  name: 'Bench press',
  type: 'STRENGTH',
  sets: 5,
  reps: 5,
  weight: 60,
};
const TIME = {name: 'Rowing', type: 'TIME', durationMin: 25};

test('EX-03 POST strength exercise', async ({api, user}) => {
  const response = await api.post('/api/exercise', {data: STRENGTH});
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({
    userId: user.id,
    ...STRENGTH,
    durationMin: 0,
    exerciseGoalId: null,
    goalDate: null,
  });
});

test('EX-04 POST time exercise nulls strength fields', async ({api}) => {
  const response = await api.post('/api/exercise', {
    // Strength fields on a TIME entry are dropped.
    data: {...TIME, sets: 3, reps: 3, weight: 10},
  });
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({
    ...TIME,
    // One timed set.
    sets: 1,
    reps: null,
    weight: null,
    exerciseSets: [{reps: null, durationSec: 25 * 60, weight: null}],
  });
});

test('EX-05 strength weight is optional', async ({api}) => {
  // undefined is dropped from the JSON body.
  const response = await api.post('/api/exercise', {
    data: {...STRENGTH, weight: undefined},
  });
  expect((await response.json()).weight).toBeNull();
});

test.describe('XA-01 POST validation', () => {
  const invalid: [string, Record<string, unknown>][] = [
    ['missing type', {name: 'x', durationMin: 1}],
    ['unknown type', {...TIME, type: 'DISTANCE'}],
    ['TIME without duration', {name: 'x', type: 'TIME'}],
    ['TIME duration 0', {...TIME, durationMin: 0}],
    ['STRENGTH reps 0', {...STRENGTH, reps: 0}],
    ['STRENGTH reps 101', {...STRENGTH, reps: 101}],
    ['STRENGTH sets 0', {...STRENGTH, sets: 0}],
    ['STRENGTH without reps', {name: 'x', type: 'STRENGTH', sets: 1}],
    ['negative weight', {...STRENGTH, weight: -1}],
    ['blank name', {...TIME, name: '  '}],
  ];
  for (const [label, data] of invalid) {
    test(`${label} → 400`, async ({api}) => {
      const response = await api.post('/api/exercise', {data});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }
});

test("XA-02 custom exercise named like today's plan is rejected", async ({
  api,
  db,
  user,
}) => {
  await seedExerciseGoal(db, user.id, {name: 'Squats', days: [weekdayIn()]});
  const response = await api.post('/api/exercise', {
    data: {...TIME, name: '  squats '},
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({
    error: `"squats" is in today's plan. Tick it off there instead.`,
  });

  // A goal planned for another day doesn't block the name.
  await seedExerciseGoal(db, user.id, {
    name: 'Lunges',
    days: [(weekdayIn() + 1) % 7],
  });
  expect(
    (await api.post('/api/exercise', {data: {...TIME, name: 'Lunges'}})).status(),
  ).toBe(201);
});

test('XA-03 GET by date includes planned goal notes', async ({api, db, user}) => {
  const goal = await seedExerciseGoal(db, user.id, {notes: 'Keep back straight'});
  await seedExercise(db, user.id, {
    name: goal.name,
    exerciseGoalId: goal.id,
    goalDate: todayIn(),
  });
  await seedExercise(db, user.id, {name: 'Old walk', loggedAt: noonDaysAgo(2)});

  const today = await (await api.get(`/api/exercise?date=${todayIn()}`)).json();
  expect(today).toHaveLength(1);
  expect(today[0]).toMatchObject({
    name: goal.name,
    exerciseGoalId: goal.id,
    exerciseGoal: {notes: 'Keep back straight'},
  });

  const past = await (await api.get(`/api/exercise?date=${daysAgoIn(2)}`)).json();
  expect(past).toMatchObject([{name: 'Old walk', exerciseGoal: null}]);

  expect((await api.get('/api/exercise?date=nope')).status()).toBe(400);
});

test.describe('XA-04 PATCH', () => {
  test("corrects today's entry", async ({api, db, user}) => {
    const entry = await seedExercise(db, user.id, {
      type: 'STRENGTH',
      durationMin: 0,
      sets: 3,
      reps: 10,
      weight: 50,
    });
    const response = await api.patch('/api/exercise', {
      data: {id: entry.id, type: 'STRENGTH', sets: 3, reps: 5, weight: null},
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      id: entry.id,
      sets: 3,
      reps: 5,
      weight: null,
      exerciseGoal: null,
    });
  });

  test('sets can switch between reps and time', async ({api, db, user}) => {
    const entry = await seedExercise(db, user.id);
    const response = await api.patch('/api/exercise', {
      data: {
        id: entry.id,
        exerciseSets: [{reps: 12}, {durationSec: 90, weight: 10}],
      },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      type: 'STRENGTH',
      sets: 2,
      reps: 12,
      durationMin: 2,
      exerciseSets: [
        {reps: 12, durationSec: null, weight: null},
        {reps: null, durationSec: 90, weight: 10},
      ],
    });

    const neither = await api.patch('/api/exercise', {
      data: {id: entry.id, exerciseSets: [{weight: 10}]},
    });
    expect(neither.status()).toBe(400);
  });

  test('past entries are read-only, unknown → 404', async ({api, db, user}) => {
    const entry = await seedExercise(db, user.id, {loggedAt: noonDaysAgo(1)});
    const past = await api.patch('/api/exercise', {
      data: {id: entry.id, type: 'TIME', durationMin: 1},
    });
    expect(past.status()).toBe(403);
    expect(await past.json()).toEqual({error: "Only today's entries can be edited"});

    const unknown = await api.patch('/api/exercise', {
      data: {id: 'nope', type: 'TIME', durationMin: 1},
    });
    expect(unknown.status()).toBe(404);
  });
});

test.describe('XA-05 DELETE', () => {
  test("deletes today's entry", async ({api, db, user}) => {
    const entry = await seedExercise(db, user.id);
    const response = await api.delete(`/api/exercise?id=${entry.id}`);
    expect(response.status()).toBe(204);
    expect(await db.exerciseLog.count({where: {id: entry.id}})).toBe(0);
  });

  test('past entries cannot be deleted', async ({api, db, user}) => {
    const entry = await seedExercise(db, user.id, {loggedAt: noonDaysAgo(1)});
    const response = await api.delete(`/api/exercise?id=${entry.id}`);
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only today's entries can be deleted",
    });
    expect(await db.exerciseLog.count({where: {id: entry.id}})).toBe(1);
  });

  test('missing id → 400, unknown → 404', async ({api}) => {
    expect((await api.delete('/api/exercise')).status()).toBe(400);
    expect((await api.delete('/api/exercise?id=nope')).status()).toBe(404);
  });
});
