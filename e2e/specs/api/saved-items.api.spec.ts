import {test, expect} from '../../fixtures/test';
import {seedSavedExercise, seedSavedFood} from '../../fixtures/db';

test.describe('Saved food', () => {
  test('POST creates, GET lists alphabetically', async ({api, user}) => {
    const created = await api.post('/api/saved-food', {
      data: {name: 'Zucchini slice', calories: 180, isPinned: true},
    });
    expect(created.status()).toBe(201);
    expect(await created.json()).toMatchObject({
      userId: user.id,
      name: 'Zucchini slice',
      calories: 180,
      protein: 0,
      isPinned: true,
    });
    await api.post('/api/saved-food', {data: {name: 'Apple', calories: 80}});

    const items = await (await api.get('/api/saved-food')).json();
    expect(items.map((i: {name: string}) => i.name)).toEqual([
      'Apple',
      'Zucchini slice',
    ]);
    expect(items[0].isPinned).toBe(false);
  });

  test('POST with the item id updates it in place', async ({api, db, user}) => {
    const item = await seedSavedFood(db, user.id, {name: 'Oats', calories: 300});
    const response = await api.post('/api/saved-food', {
      data: {id: item.id, name: 'Oats', calories: 280, protein: 10, isPinned: true},
    });
    // Updates also answer 201.
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({id: item.id, calories: 280, isPinned: true});
    expect(await db.savedFoodItem.count({where: {userId: user.id}})).toBe(1);
  });

  test('FOOD-09 a different item with the same name is rejected', async ({
    api,
    db,
    user,
  }) => {
    await seedSavedFood(db, user.id, {name: 'Oats'});
    const response = await api.post('/api/saved-food', {
      data: {name: 'Oats', calories: 1},
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({error: 'An item with this name already exists'});
  });

  test('names are per user', async ({api, db, makeUser}) => {
    const other = await makeUser();
    await seedSavedFood(db, other.id, {name: 'Shared name'});
    const response = await api.post('/api/saved-food', {
      data: {name: 'Shared name', calories: 1},
    });
    expect(response.status()).toBe(201);
  });

  for (const [label, data] of [
    ['empty name', {name: '', calories: 1}],
    ['negative calories', {name: 'x', calories: -1}],
    ['saturated fat above fat', {name: 'x', calories: 1, fat: 1, saturatedFat: 2}],
    ['non-boolean pin', {name: 'x', calories: 1, isPinned: 'yes'}],
  ] as const) {
    test(`validation: ${label} → 400`, async ({api}) => {
      const response = await api.post('/api/saved-food', {data});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }

  test('DELETE removes the item; missing id → 400', async ({api, db, user}) => {
    const item = await seedSavedFood(db, user.id);
    const response = await api.delete(`/api/saved-food?id=${item.id}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({success: true});
    expect(await db.savedFoodItem.count({where: {id: item.id}})).toBe(0);

    const missing = await api.delete('/api/saved-food');
    expect(missing.status()).toBe(400);
    expect(await missing.json()).toEqual({error: 'Missing id'});
  });
});

test.describe('Saved exercise', () => {
  test('POST creates strength and time items', async ({api}) => {
    const strength = await api.post('/api/saved-exercise', {
      data: {name: 'Deadlift', calories: 120, type: 'STRENGTH', sets: 3, reps: 5, weight: 100},
    });
    expect(strength.status()).toBe(201);
    expect(await strength.json()).toMatchObject({
      type: 'STRENGTH',
      sets: 3,
      reps: 5,
      weight: 100,
      durationMin: 0,
      isPinned: false,
    });

    const time = await api.post('/api/saved-exercise', {
      data: {name: '  Swim  ', calories: 300, type: 'TIME', durationMin: 30, isPinned: true},
    });
    expect(await time.json()).toMatchObject({
      name: 'Swim',
      durationMin: 30,
      sets: null,
      isPinned: true,
    });
  });

  test('duplicate name → 400; update by id → 201', async ({api, db, user}) => {
    const item = await seedSavedExercise(db, user.id, {name: 'Yoga'});
    const duplicate = await api.post('/api/saved-exercise', {
      data: {name: 'Yoga', calories: 1, type: 'TIME', durationMin: 5},
    });
    expect(duplicate.status()).toBe(400);
    expect(await duplicate.json()).toEqual({
      error: 'An item with this name already exists',
    });

    const update = await api.post('/api/saved-exercise', {
      data: {id: item.id, name: 'Yoga', calories: 99, type: 'TIME', durationMin: 45},
    });
    expect(update.status()).toBe(201);
    expect(await update.json()).toMatchObject({id: item.id, calories: 99, durationMin: 45});
  });

  test('validation and delete', async ({api, db, user}) => {
    const invalid = await api.post('/api/saved-exercise', {
      data: {name: 'x', calories: 1, type: 'STRENGTH', sets: 1, reps: 0},
    });
    expect(invalid.status()).toBe(400);

    const item = await seedSavedExercise(db, user.id);
    expect((await api.delete(`/api/saved-exercise?id=${item.id}`)).status()).toBe(200);
    expect(await db.savedExerciseItem.count({where: {id: item.id}})).toBe(0);
    expect((await api.delete('/api/saved-exercise')).status()).toBe(400);
  });
});
