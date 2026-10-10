import {test, expect} from '../../fixtures/test';
import {
  seedExercise,
  seedExerciseGoal,
  seedFood,
  seedSavedExercise,
  seedSavedFood,
  seedWeight,
} from '../../fixtures/db';
import {todayIn} from '../../fixtures/dates';

const PROTECTED: [method: string, path: string][] = [
  ['GET', `/api/food?date=${todayIn()}`],
  ['POST', '/api/food'],
  ['PATCH', '/api/food'],
  ['DELETE', '/api/food?id=x'],
  ['GET', `/api/exercise?date=${todayIn()}`],
  ['POST', '/api/exercise'],
  ['PATCH', '/api/exercise'],
  ['DELETE', '/api/exercise?id=x'],
  ['GET', '/api/exercise-goals'],
  ['POST', '/api/exercise-goals'],
  ['PATCH', '/api/exercise-goals'],
  ['DELETE', '/api/exercise-goals?id=x'],
  ['POST', '/api/exercise-goals/log'],
  ['DELETE', '/api/exercise-goals/log?goalId=x'],
  ['GET', '/api/saved-food'],
  ['POST', '/api/saved-food'],
  ['DELETE', '/api/saved-food?id=x'],
  ['GET', '/api/saved-exercise'],
  ['POST', '/api/saved-exercise'],
  ['DELETE', '/api/saved-exercise?id=x'],
  ['POST', '/api/weight'],
  ['DELETE', '/api/weight?id=x'],
  ['POST', '/api/goals'],
];

test.describe('SEC-01 unauthenticated requests', () => {
  for (const [method, path] of PROTECTED) {
    test(`${method} ${path} → 401`, async ({request}) => {
      const response = await request.fetch(path, {method, data: {}});
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({error: 'Unauthorized'});
    });
  }
});

test('SEC-02 estimate endpoints are hidden when AI is off', async ({request, api}) => {
  for (const path of ['/api/food/estimate', '/api/exercise/estimate']) {
    // The AI check runs before auth, so even anonymous callers get 404.
    const anonymous = await request.post(path, {data: {description: 'egg'}});
    expect(anonymous.status()).toBe(404);
    expect(await anonymous.json()).toEqual({error: 'Not found'});

    const signedIn = await api.post(path, {data: {description: 'egg'}});
    expect(signedIn.status()).toBe(404);
  }
});

test.describe('SEC-03 users cannot touch each other’s data', () => {
  test('food, exercise and weight entries', async ({db, user, makeUser, apiAs}) => {
    const food = await seedFood(db, user.id, {name: 'Owner food'});
    const exercise = await seedExercise(db, user.id, {name: 'Owner run'});
    const weight = await seedWeight(db, user.id);

    const intruder = await apiAs(await makeUser());

    const patchFood = await intruder.patch('/api/food', {
      data: {id: food.id, name: 'Hacked', calories: 1},
    });
    expect(patchFood.status()).toBe(404);
    expect((await intruder.delete(`/api/food?id=${food.id}`)).status()).toBe(404);

    const patchExercise = await intruder.patch('/api/exercise', {
      data: {id: exercise.id, calories: 1, type: 'TIME', durationMin: 1},
    });
    expect(patchExercise.status()).toBe(404);
    expect(
      (await intruder.delete(`/api/exercise?id=${exercise.id}`)).status(),
    ).toBe(404);

    expect((await intruder.delete(`/api/weight?id=${weight.id}`)).status()).toBe(
      404,
    );

    // Nothing changed for the owner.
    expect((await db.foodLog.findUnique({where: {id: food.id}}))?.name).toBe(
      'Owner food',
    );
    expect(await db.exerciseLog.count({where: {id: exercise.id}})).toBe(1);
    expect(await db.weightLog.count({where: {id: weight.id}})).toBe(1);

    // And the intruder's lists never include the owner's rows.
    const today = todayIn();
    expect(await (await intruder.get(`/api/food?date=${today}`)).json()).toEqual([]);
    expect(await (await intruder.get(`/api/exercise?date=${today}`)).json()).toEqual(
      [],
    );
  });

  test('exercise goals and ticks', async ({db, user, makeUser, apiAs}) => {
    const goal = await seedExerciseGoal(db, user.id, {name: 'Owner squats'});
    const intruder = await apiAs(await makeUser());

    const update = await intruder.post('/api/exercise-goals', {
      data: {
        id: goal.id,
        name: 'Hacked',
        days: [1],
        type: 'TIME',
        durationMin: 5,
      },
    });
    expect(update.status()).toBe(404);
    expect(await update.json()).toEqual({error: 'Goal not found'});

    const settings = await intruder.patch('/api/exercise-goals', {
      data: {id: goal.id, tempoMs: 2000},
    });
    expect(settings.status()).toBe(404);

    const tick = await intruder.post('/api/exercise-goals/log', {
      data: {goalId: goal.id},
    });
    expect(tick.status()).toBe(404);

    expect(
      (await intruder.delete(`/api/exercise-goals?id=${goal.id}`)).status(),
    ).toBe(404);
    expect(await (await intruder.get('/api/exercise-goals')).json()).toEqual([]);

    const stored = await db.exerciseGoal.findUnique({where: {id: goal.id}});
    expect(stored?.name).toBe('Owner squats');
    expect(stored?.tempoMs).toBeNull();
  });
});

test('SEC-04 cross-user saved item delete reports success but deletes nothing', async ({
  db,
  user,
  makeUser,
  apiAs,
}) => {
  const savedFood = await seedSavedFood(db, user.id);
  const savedExercise = await seedSavedExercise(db, user.id);
  const intruder = await apiAs(await makeUser());

  // FINDING: the response claims success even though no row matched.
  const food = await intruder.delete(`/api/saved-food?id=${savedFood.id}`);
  expect(food.status()).toBe(200);
  expect(await food.json()).toEqual({success: true});

  const exercise = await intruder.delete(
    `/api/saved-exercise?id=${savedExercise.id}`,
  );
  expect(exercise.status()).toBe(200);

  expect(await db.savedFoodItem.count({where: {id: savedFood.id}})).toBe(1);
  expect(await db.savedExerciseItem.count({where: {id: savedExercise.id}})).toBe(1);
  expect(await (await intruder.get('/api/saved-food')).json()).toEqual([]);
});

test('SEC-05 unsupported methods return 405', async ({api}) => {
  expect((await api.put('/api/food', {data: {}})).status()).toBe(405);
  expect((await api.get('/api/weight')).status()).toBe(405);
  expect((await api.get('/api/goals')).status()).toBe(405);
});
