import {test, expect} from '../../fixtures/test';
import {seedWeight} from '../../fixtures/db';
import {noonDaysAgo} from '../../fixtures/dates';

test.describe('Weight API', () => {
  test('WT-01 POST logs a weight', async ({api, user}) => {
    const response = await api.post('/api/weight', {data: {weight: 72.5}});
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({userId: user.id, weight: 72.5});
  });

  for (const [label, data] of [
    ['zero', {weight: 0}],
    ['negative', {weight: -70}],
    ['string', {weight: '70'}],
    ['missing', {}],
  ] as const) {
    test(`WT-02 ${label} weight → 400`, async ({api}) => {
      const response = await api.post('/api/weight', {data});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }

  test('WT-06 DELETE: past entries allowed, missing/unknown rejected', async ({
    api,
    db,
    user,
  }) => {
    const old = await seedWeight(db, user.id, {loggedAt: noonDaysAgo(20)});
    expect((await api.delete(`/api/weight?id=${old.id}`)).status()).toBe(204);
    expect(await db.weightLog.count({where: {id: old.id}})).toBe(0);

    const missing = await api.delete('/api/weight');
    expect(missing.status()).toBe(400);
    expect(await missing.json()).toEqual({error: 'Entry ID is required'});
    expect((await api.delete('/api/weight?id=nope')).status()).toBe(404);
  });
});

test.describe('Goals API', () => {
  test('FG-02 POST updates goals', async ({api, db, user}) => {
    const goals = {
      calorieGoal: 1800,
      proteinGoal: 140,
      carbsGoal: 200,
      fatGoal: 60,
      saturatedFatGoal: 15,
    };
    const response = await api.post('/api/goals', {data: goals});
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({userId: user.id, ...goals});
    expect(await db.goal.findUnique({where: {userId: user.id}})).toMatchObject(goals);
  });

  test('GA-02 partial update keeps the other goals', async ({api, db, user}) => {
    await api.post('/api/goals', {data: {calorieGoal: 1800, healthNotes: 'Low sodium'}});
    await api.post('/api/goals', {data: {proteinGoal: 120}});
    expect(await db.goal.findUnique({where: {userId: user.id}})).toMatchObject({
      calorieGoal: 1800,
      proteinGoal: 120,
      carbsGoal: 250,
      healthNotes: 'Low sodium',
    });
  });

  test('GA-02 creates missing goals with defaults', async ({api, db, user}) => {
    await db.goal.delete({where: {userId: user.id}});
    const response = await api.post('/api/goals', {data: {calorieGoal: 1800}});
    expect(await response.json()).toMatchObject({
      calorieGoal: 1800,
      proteinGoal: 150,
      carbsGoal: 250,
      fatGoal: 70,
      saturatedFatGoal: 20,
    });
  });

  test('GA-02 health notes are trimmed; blank clears them', async ({api, db, user}) => {
    await api.post('/api/goals', {data: {healthNotes: '  High LDL  '}});
    expect((await db.goal.findUnique({where: {userId: user.id}}))?.healthNotes).toBe(
      'High LDL',
    );
    await api.post('/api/goals', {data: {healthNotes: '   '}});
    expect(
      (await db.goal.findUnique({where: {userId: user.id}}))?.healthNotes,
    ).toBeNull();
  });

  for (const [label, data] of [
    ['decimal', {calorieGoal: 1800.5}],
    ['negative', {fatGoal: -1}],
    ['string', {proteinGoal: '100'}],
    ['notes over 500 chars', {healthNotes: 'x'.repeat(501)}],
  ] as const) {
    test(`GA-01 ${label} → 400`, async ({api}) => {
      const response = await api.post('/api/goals', {data});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }

  test('GA-03 server accepts saturated fat goal above fat goal', async ({api}) => {
    // FINDING: only the form enforces saturated fat <= fat.
    const response = await api.post('/api/goals', {
      data: {fatGoal: 10, saturatedFatGoal: 50},
    });
    expect(response.status()).toBe(200);
  });
});
