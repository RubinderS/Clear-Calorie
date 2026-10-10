import {test, expect} from '../../fixtures/test';
import {seedFood} from '../../fixtures/db';
import {daysAgoIn, instantAt, noonDaysAgo, todayIn} from '../../fixtures/dates';

const VALID = {name: 'Toast', calories: 150};

test('POST logs food with defaults and returns the entry', async ({api, user, db}) => {
  const response = await api.post('/api/food', {data: VALID});
  expect(response.status()).toBe(201);
  const entry = await response.json();
  expect(entry).toMatchObject({
    userId: user.id,
    name: 'Toast',
    calories: 150,
    protein: 0,
    carbs: 0,
    fat: 0,
    saturatedFat: 0,
    healthAlertLevel: null,
    healthAlertMessage: null,
  });
  expect(entry.id).toEqual(expect.any(String));
  expect(Date.parse(entry.loggedAt)).toBeGreaterThan(Date.now() - 60_000);
  expect(await db.foodLog.count({where: {userId: user.id}})).toBe(1);
});

test('POST trims the name and keeps decimal nutrition', async ({api}) => {
  const response = await api.post('/api/food', {
    data: {name: '  Yoghurt  ', calories: 99.5, protein: 12.5, fat: 3.3, saturatedFat: 2.1},
  });
  expect(await response.json()).toMatchObject({
    name: 'Yoghurt',
    calories: 99.5,
    protein: 12.5,
    fat: 3.3,
    saturatedFat: 2.1,
  });
});

test.describe('FA-01 POST validation', () => {
  const invalid: [string, Record<string, unknown>][] = [
    ['missing name', {calories: 1}],
    ['blank name', {name: '   ', calories: 1}],
    ['missing calories', {name: 'x'}],
    ['negative calories', {name: 'x', calories: -1}],
    ['string calories', {name: 'x', calories: '100'}],
    ['negative protein', {name: 'x', calories: 1, protein: -2}],
    ['saturated fat above fat', {name: 'x', calories: 1, fat: 2, saturatedFat: 3}],
    [
      'unknown health alert level',
      {name: 'x', calories: 1, healthAlert: {level: 'ok', message: 'fine'}},
    ],
    [
      'health alert message over 200 chars',
      {name: 'x', calories: 1, healthAlert: {level: 'caution', message: 'm'.repeat(201)}},
    ],
    [
      'blank health alert message',
      {name: 'x', calories: 1, healthAlert: {level: 'caution', message: ' '}},
    ],
  ];
  for (const [label, data] of invalid) {
    test(`${label} → 400`, async ({api}) => {
      const response = await api.post('/api/food', {data});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }
});

test('FA-02 health alert is stored on the entry', async ({api, db}) => {
  const response = await api.post('/api/food', {
    data: {...VALID, healthAlert: {level: 'avoid', message: 'High in sat fat'}},
  });
  const entry = await response.json();
  expect(entry).toMatchObject({
    healthAlertLevel: 'avoid',
    healthAlertMessage: 'High in sat fat',
  });
  expect(
    (await db.foodLog.findUnique({where: {id: entry.id}}))?.healthAlertLevel,
  ).toBe('avoid');
});

test.describe('FA-03 GET by date', () => {
  test('returns only that day, newest first', async ({api, db, user}) => {
    const today = todayIn();
    await seedFood(db, user.id, {name: 'Early', loggedAt: instantAt(today, '00:05')});
    await seedFood(db, user.id, {name: 'Late', loggedAt: instantAt(today, '00:10')});
    await seedFood(db, user.id, {name: 'Yesterday', loggedAt: noonDaysAgo(1)});

    const todays = await (await api.get(`/api/food?date=${today}`)).json();
    expect(todays.map((e: {name: string}) => e.name)).toEqual(['Late', 'Early']);

    const yesterday = await (
      await api.get(`/api/food?date=${daysAgoIn(1)}`)
    ).json();
    expect(yesterday.map((e: {name: string}) => e.name)).toEqual(['Yesterday']);
  });

  for (const query of ['', '?date=', '?date=2026-13-45', '?date=2026-02-30', '?date=10/10/2026']) {
    test(`invalid date "${query}" → 400`, async ({api}) => {
      const response = await api.get(`/api/food${query}`);
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid date'});
    });
  }
});

test.describe('FA-04 PATCH', () => {
  test("updates today's entry", async ({api, db, user}) => {
    const entry = await seedFood(db, user.id, {name: 'Big bowl', calories: 600});
    const response = await api.patch('/api/food', {
      data: {id: entry.id, name: 'Half bowl', calories: 300, protein: 10, fat: 4, saturatedFat: 1},
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      id: entry.id,
      name: 'Half bowl',
      calories: 300,
      protein: 10,
      carbs: 0,
      fat: 4,
      saturatedFat: 1,
    });
  });

  test('rejects past entries', async ({api, db, user}) => {
    const entry = await seedFood(db, user.id, {loggedAt: noonDaysAgo(1)});
    const response = await api.patch('/api/food', {
      data: {id: entry.id, name: 'x', calories: 1},
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only today's entries can be edited",
    });
  });

  test('unknown id → 404, invalid body → 400', async ({api}) => {
    const missing = await api.patch('/api/food', {
      data: {id: 'missing', name: 'x', calories: 1},
    });
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toEqual({error: 'Entry not found'});

    const invalid = await api.patch('/api/food', {
      data: {id: 'missing', name: 'x', calories: 1, fat: 1, saturatedFat: 2},
    });
    expect(invalid.status()).toBe(400);
  });
});

test.describe('FA-05 DELETE', () => {
  test('deletes and returns 204 with no body', async ({api, db, user}) => {
    const entry = await seedFood(db, user.id);
    const response = await api.delete(`/api/food?id=${entry.id}`);
    expect(response.status()).toBe(204);
    expect(await response.text()).toBe('');
    expect(await db.foodLog.count({where: {id: entry.id}})).toBe(0);
  });

  test('missing id → 400, unknown → 404', async ({api}) => {
    const missing = await api.delete('/api/food');
    expect(missing.status()).toBe(400);
    expect(await missing.json()).toEqual({error: 'Entry ID is required'});

    const unknown = await api.delete('/api/food?id=nope');
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({error: 'Entry not found'});
  });

  test('FA-06 past entries can be deleted through the API', async ({api, db, user}) => {
    // FINDING: exercise rejects this with 403 and the UI disables it, but food allows it.
    const entry = await seedFood(db, user.id, {loggedAt: noonDaysAgo(3)});
    expect((await api.delete(`/api/food?id=${entry.id}`)).status()).toBe(204);
  });
});

test('FA-07 malformed JSON → 500', async ({api}) => {
  const response = await api.post('/api/food', {
    headers: {'Content-Type': 'application/json'},
    data: Buffer.from('{oops'),
  });
  expect(response.status()).toBe(500);
  expect(await response.json()).toEqual({error: 'Failed to log food'});
});
