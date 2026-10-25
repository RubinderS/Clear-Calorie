// What the database itself must guarantee: uniqueness that treats missing
// values as distinct, links cleared when what they point to goes, and the
// plain record shape every API response uses (`id`, never `_id`; optional
// fields as null, never missing).
import {test, expect} from '../../fixtures/test';
import {
  seedBodyMetric,
  seedBodyMetricLog,
  seedExerciseGoal,
  seedWeeklyReport,
} from '../../fixtures/db';
import {todayIn} from '../../fixtures/dates';

const MONDAY = '2026-01-05';

test.describe('DI-01 missing values never collide on unique keys', () => {
  test('two exercises logged outside the plan', async ({api, db, user}) => {
    for (const name of ['Rowing', 'Cycling']) {
      const response = await api.post('/api/exercise', {
        data: {name, type: 'TIME', durationMin: 20},
      });
      expect(response.status()).toBe(201);
    }
    expect(await db.exerciseLog.count({where: {userId: user.id, exerciseGoalId: null}})).toBe(2);
  });

  test('two custom body metrics', async ({api, db, user}) => {
    for (const label of ['Bicep', 'Calf']) {
      const response = await api.post('/api/body-metrics', {
        data: {label, unit: 'cm', direction: 'up'},
      });
      expect(response.status()).toBe(201);
    }
    expect(await db.bodyMetric.count({where: {userId: user.id, key: null}})).toBe(2);
  });

  test('first weekly reports of two users', async ({db, user, makeUser}) => {
    const other = await makeUser();
    await seedWeeklyReport(db, user.id, {weekStart: MONDAY});
    await seedWeeklyReport(db, other.id, {weekStart: MONDAY});
    expect(await db.weeklyReport.count({where: {previousReportId: null, weekStart: MONDAY}})).toBe(2);
  });
});

test('DI-02 deleting goals keeps their ticks, unlinked, even on the same day', async ({
  api,
  db,
  user,
}) => {
  const goals = [
    await seedExerciseGoal(db, user.id, {name: 'Squats'}),
    await seedExerciseGoal(db, user.id, {name: 'Lunges'}),
  ];
  for (const goal of goals) {
    expect((await api.post('/api/exercise-goals/log', {data: {goalId: goal.id}})).status()).toBe(201);
  }
  for (const goal of goals) {
    expect((await api.delete(`/api/exercise-goals?id=${goal.id}`)).status()).toBe(204);
  }

  const logs = await db.exerciseLog.findMany({where: {userId: user.id}, orderBy: {name: 'asc'}});
  expect(logs.map(({name, exerciseGoalId, goalDate}) => ({name, exerciseGoalId, goalDate}))).toEqual([
    {name: 'Lunges', exerciseGoalId: null, goalDate: todayIn()},
    {name: 'Squats', exerciseGoalId: null, goalDate: todayIn()},
  ]);
});

test('DI-03 deleting a metric removes only its own logs', async ({api, db, user}) => {
  const archived = await seedBodyMetric(db, user.id, {archivedAt: new Date()});
  const kept = await seedBodyMetric(db, user.id, {key: 'chest', label: 'Chest'});
  await seedBodyMetricLog(db, archived.id);
  await seedBodyMetricLog(db, kept.id);

  expect((await api.delete(`/api/body-metrics?id=${archived.id}`)).status()).toBe(204);
  expect(await db.bodyMetricLog.count({where: {metricId: archived.id}})).toBe(0);
  expect(await db.bodyMetricLog.count({where: {metricId: kept.id}})).toBe(1);
});

test('DI-04 editing an entry replaces its sets in order', async ({api, db}) => {
  const created = await (
    await api.post('/api/exercise', {
      data: {
        name: 'Bench press',
        exerciseSets: [
          {reps: 10, weight: 60},
          {reps: 8, weight: 65},
          {reps: 6, weight: 70},
        ],
      },
    })
  ).json();

  const response = await api.patch('/api/exercise', {
    data: {
      id: created.id,
      exerciseSets: [
        {reps: 12, weight: 50},
        {durationSec: 45},
      ],
    },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).exerciseSets).toEqual([
    {reps: 12, durationSec: null, weight: 50, name: null, catalogId: null},
    {reps: null, durationSec: 45, weight: null, name: null, catalogId: null},
  ]);
  const stored = await db.exerciseLog.findUniqueOrThrow({where: {id: created.id}});
  expect(stored.exerciseSets.map((set) => set.position)).toEqual([1, 2]);
});

test.describe('DI-05 responses are plain records', () => {
  /** An `id`, no `_id` or Mongo bookkeeping, and every listed field present. */
  function expectPlain(record: Record<string, unknown>, nullFields: string[]) {
    expect(typeof record.id).toBe('string');
    expect(record).not.toHaveProperty('_id');
    expect(record).not.toHaveProperty('__v');
    for (const field of nullFields) {
      expect(record, field).toHaveProperty(field, null);
    }
  }

  test('food', async ({api}) => {
    await api.post('/api/food', {data: {name: 'Toast', calories: 200}});
    const [entry] = await (await api.get(`/api/food?date=${todayIn()}`)).json();
    expectPlain(entry, ['healthAlertLevel', 'healthAlertMessage']);
    expect(entry).toMatchObject({protein: 0, carbs: 0, fat: 0, saturatedFat: 0});
    expect(typeof entry.loggedAt).toBe('string');
  });

  test('exercise', async ({api}) => {
    await api.post('/api/exercise', {data: {name: 'Rowing', type: 'TIME', durationMin: 25}});
    const [entry] = await (await api.get(`/api/exercise?date=${todayIn()}`)).json();
    expectPlain(entry, ['exerciseGoalId', 'goalDate', 'exerciseGoal']);
    expect(entry.exerciseSets).toEqual([
      {reps: null, durationSec: 1500, weight: null, name: null, catalogId: null},
    ]);
  });

  test('goals, saved items and body metrics', async ({api}) => {
    const goals = await (await api.post('/api/goals', {data: {calorieGoal: 1900}})).json();
    expectPlain(goals, []);
    expect(goals).toMatchObject({calorieGoal: 1900, proteinGoal: 150});

    await api.post('/api/saved-food', {data: {name: 'Oats', calories: 300}});
    const [saved] = await (await api.get('/api/saved-food')).json();
    expectPlain(saved, []);
    expect(saved).toMatchObject({isPinned: false, protein: 0});

    const metric = await (
      await api.post('/api/body-metrics', {data: {label: 'Neck', unit: 'cm', direction: 'down'}})
    ).json();
    expectPlain(metric, ['key', 'archivedAt']);
  });

  test('exercise goals', async ({api}) => {
    const goal = await (
      await api.post('/api/exercise-goals', {
        data: {name: 'Plank', type: 'TIME', durationMin: 2, days: [1]},
      })
    ).json();
    expectPlain(goal, ['tempoMs', 'notes', 'steps']);
    const [listed] = await (await api.get('/api/exercise-goals')).json();
    expect(listed).toEqual(goal);
  });
});
