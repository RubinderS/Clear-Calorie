import {test, expect} from '../../fixtures/test';
import {seedExerciseGoal} from '../../fixtures/db';
import {shiftDate, todayIn, weekdayIn} from '../../fixtures/dates';
import {weekStartOf} from '../../../lib/exercise';

const today = weekdayIn();
const tomorrow = (today + 1) % 7;
const yesterday = (today + 6) % 7;
// Sunday ends the week, so it has no later day to swap with.
const noLaterDay = today === 0;

test.beforeEach(async ({db, user}) => {
  await seedExerciseGoal(db, user.id, {name: 'Cardio', days: [today]});
  await seedExerciseGoal(db, user.id, {name: 'Legs', days: [tomorrow]});
});

test('SW-01 swapping today with tomorrow trades their plans this week', async ({
  api,
  db,
  user,
}) => {
  test.skip(noLaterDay, 'Sunday has no later day this week');
  const response = await api.post('/api/exercise-goals/swap', {
    data: {a: today, b: tomorrow},
  });
  expect(response.status()).toBe(200);
  const overview = await response.json();
  expect(overview.days.find((day: {weekday: number}) => day.weekday === today)).toMatchObject({
    plannedWeekday: tomorrow,
    exercises: ['Legs'],
  });

  const swap = await db.exerciseWeekSwap.findFirst({where: {userId: user.id}});
  expect(swap?.weekStart).toBe(weekStartOf(todayIn()));

  // Tomorrow's exercise can be ticked today; today's own can't.
  const legs = await db.exerciseGoal.findFirst({where: {userId: user.id, name: 'Legs'}});
  const cardio = await db.exerciseGoal.findFirst({where: {userId: user.id, name: 'Cardio'}});
  expect(
    (await api.post('/api/exercise-goals/log', {data: {goalId: legs!.id}})).status(),
  ).toBe(201);
  expect(
    (await api.post('/api/exercise-goals/log', {data: {goalId: cardio!.id}})).status(),
  ).toBe(400);
});

test('SW-02 swapping back removes the week row', async ({api, db, user}) => {
  test.skip(noLaterDay, 'Sunday has no later day this week');
  await api.post('/api/exercise-goals/swap', {data: {a: today, b: tomorrow}});
  await api.post('/api/exercise-goals/swap', {data: {a: tomorrow, b: today}});
  expect(await db.exerciseWeekSwap.count({where: {userId: user.id}})).toBe(0);
});

test('SW-03 DELETE resets this week', async ({api, db, user}) => {
  test.skip(noLaterDay, 'Sunday has no later day this week');
  await api.post('/api/exercise-goals/swap', {data: {a: today, b: tomorrow}});
  expect((await api.delete('/api/exercise-goals/swap')).status()).toBe(200);
  expect(await db.exerciseWeekSwap.count({where: {userId: user.id}})).toBe(0);
});

test('SW-04 past days, the same day and bad input are refused', async ({api}) => {
  if (today !== 1) {
    // Monday starts the week, so it has no earlier day in it.
    const past = await api.post('/api/exercise-goals/swap', {
      data: {a: today, b: yesterday},
    });
    expect(past.status()).toBe(400);
    expect(await past.json()).toEqual({error: "Days that have passed can't be swapped"});
  }
  const same = await api.post('/api/exercise-goals/swap', {data: {a: today, b: today}});
  expect(same.status()).toBe(400);
  const invalid = await api.post('/api/exercise-goals/swap', {data: {a: 7, b: 1}});
  expect(await invalid.json()).toEqual({error: 'Invalid input'});
});

test('SW-05 a started day cannot be swapped away', async ({api, db, user}) => {
  test.skip(noLaterDay, 'Sunday has no later day this week');
  const cardio = await db.exerciseGoal.findFirst({where: {userId: user.id, name: 'Cardio'}});
  await api.post('/api/exercise-goals/log', {data: {goalId: cardio!.id}});
  const response = await api.post('/api/exercise-goals/swap', {
    data: {a: today, b: tomorrow},
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({error: "You've already started this day's workout"});
});

test("SW-06 last week's swap doesn't carry over", async ({api, db, user}) => {
  const lastWeek = shiftDate(weekStartOf(todayIn()), -7);
  const dayMap = [0, 1, 2, 3, 4, 5, 6];
  [dayMap[today], dayMap[tomorrow]] = [dayMap[tomorrow], dayMap[today]];
  await db.exerciseWeekSwap.create({data: {userId: user.id, weekStart: lastWeek, dayMap}});

  const overview = await (await api.get('/api/exercise-goals/swap')).json();
  for (const day of overview.days) expect(day.plannedWeekday).toBe(day.weekday);
  const cardio = await db.exerciseGoal.findFirst({where: {userId: user.id, name: 'Cardio'}});
  expect(
    (await api.post('/api/exercise-goals/log', {data: {goalId: cardio!.id}})).status(),
  ).toBe(201);
});

test("SW-07 each day carries its focus, like a leg day", async ({api, db, user}) => {
  for (const [name, catalogId] of [
    ['Barbell squat', 'barbell-squat'],
    ['Goblet squat', 'goblet-squat'],
  ]) {
    await seedExerciseGoal(db, user.id, {name, catalogId, days: [tomorrow]});
  }
  const overview = await (await api.get('/api/exercise-goals/swap')).json();
  const byDay = (weekday: number) =>
    overview.days.find((day: {weekday: number}) => day.weekday === weekday);
  expect(byDay(tomorrow).focus).toBe('Leg day');
  // Own exercises alone don't say what a day works.
  expect(byDay(today).focus).toBeNull();
});
