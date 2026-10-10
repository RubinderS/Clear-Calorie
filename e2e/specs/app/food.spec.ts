import type {Locator, Page} from '@playwright/test';
import {
  test,
  expect,
  nextApiRequest,
  onNextDialog,
  trackRequests,
} from '../../fixtures/test';
import {seedSavedFood} from '../../fixtures/db';
import {calorieSummary, openQuickLog} from '../../fixtures/ui';

// Scoped to the dialog: Next.js's route announcer is also role=alert.
function panelAlert(page: Page) {
  return page.getByRole('dialog', {name: 'Log food'}).getByRole('alert');
}

async function openFood(page: Page) {
  await page.goto('/dashboard');
  return openQuickLog(page, 'food');
}

function fields(form: Locator) {
  return {
    name: form.getByLabel('Food name'),
    calories: form.getByLabel('Calories', {exact: true}),
    protein: form.getByLabel('Protein (g)'),
    carbs: form.getByLabel('Carbs (g)'),
    fat: form.getByLabel('Fat (g)', {exact: true}),
    saturatedFat: form.getByLabel('of which saturated (g)'),
    save: form.getByLabel('Save this item for later'),
    pin: form.getByLabel('Pin this item'),
    submit: form.getByRole('button', {name: 'Log food'}),
    suggestions: form.getByRole('listitem'),
  };
}

test('FOOD-01 log a food with just name and calories', async ({
  authedPage: page,
  db,
  user,
}) => {
  const form = fields(await openFood(page));
  await form.name.fill('Banana');
  await form.calories.fill('105');

  const request = nextApiRequest(page, '/api/food');
  await form.submit.click();
  const sent = await request;
  expect(sent.postDataJSON()).toEqual({
    name: 'Banana',
    calories: 105,
    protein: 0,
    carbs: 0,
    fat: 0,
    saturatedFat: 0,
    healthAlert: null,
  });
  const response = await sent.response();
  expect(response?.status()).toBe(201);
  expect(await response?.json()).toMatchObject({id: expect.any(String), name: 'Banana'});

  await expect(page.getByRole('dialog', {name: 'Log food'})).toBeHidden();
  await expect(calorieSummary(page).eaten).toHaveText('105');
  expect(await db.foodLog.count({where: {userId: user.id}})).toBe(1);
});

test('FOOD-02 decimal macros are kept', async ({authedPage: page, db, user}) => {
  const form = fields(await openFood(page));
  await form.name.fill('  Greek yoghurt  ');
  await form.calories.fill('146.5');
  await form.protein.fill('12.5');
  await form.carbs.fill('6.2');
  await form.fat.fill('7.5');
  await form.saturatedFat.fill('4.8');

  const request = nextApiRequest(page, '/api/food');
  await form.submit.click();
  // FOOD-05: the name is trimmed before sending.
  expect((await request).postDataJSON()).toMatchObject({
    name: 'Greek yoghurt',
    calories: 146.5,
    protein: 12.5,
    carbs: 6.2,
    fat: 7.5,
    saturatedFat: 4.8,
  });
  await expect(calorieSummary(page).eaten).toHaveText('146.5');
  expect(await db.foodLog.findFirst({where: {userId: user.id}})).toMatchObject({
    protein: 12.5,
    saturatedFat: 4.8,
  });
});

test('FOOD-03 saturated fat above total fat is blocked', async ({authedPage: page}) => {
  const calls = trackRequests(page, '/api/food');
  const form = fields(await openFood(page));
  await form.name.fill('Butter');
  await form.calories.fill('100');
  await form.fat.fill('2');
  await form.saturatedFat.fill('3');
  await form.submit.click();

  await expect(panelAlert(page)).toHaveText('Saturated fat cannot exceed total fat.');
  await expect(form.saturatedFat).toHaveAttribute('aria-invalid', 'true');
  await expect(form.saturatedFat).toHaveAttribute('aria-describedby', 'saturatedFat-error');
  expect(calls).toEqual([]);
});

test('FOOD-04 name and calories are required', async ({authedPage: page}) => {
  const calls = trackRequests(page, '/api/food');
  const form = fields(await openFood(page));
  await form.submit.click();
  await expect(form.name).toHaveJSProperty('validity.valueMissing', true);
  await form.name.fill('Apple');
  await form.submit.click();
  await expect(form.calories).toHaveJSProperty('validity.valueMissing', true);
  await form.calories.fill('-5');
  await form.submit.click();
  await expect(form.calories).toHaveJSProperty('validity.rangeUnderflow', true);
  expect(calls).toEqual([]);
});

test('FOOD-06 saving for later creates the saved item first', async ({
  authedPage: page,
  db,
  user,
}) => {
  const order: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.startsWith('/api/')) order.push(path);
  });

  const form = fields(await openFood(page));
  await expect(form.pin).toBeDisabled();
  await form.save.check();
  await expect(form.pin).toBeEnabled();
  await form.pin.check();
  await form.save.uncheck();
  await expect(form.pin).not.toBeChecked();
  await expect(form.pin).toBeDisabled();
  await form.save.check();

  await form.name.fill('Overnight oats');
  await form.calories.fill('350');
  await form.protein.fill('14');
  const saved = nextApiRequest(page, '/api/saved-food');
  const logged = nextApiRequest(page, '/api/food');
  await form.submit.click();

  expect((await saved).postDataJSON()).toEqual({
    name: 'Overnight oats',
    calories: 350,
    protein: 14,
    carbs: 0,
    fat: 0,
    saturatedFat: 0,
    isPinned: false,
  });
  await logged;
  expect(order).toEqual(['/api/saved-food', '/api/food']);
  await expect(page.getByRole('dialog', {name: 'Log food'})).toBeHidden();
  expect(await db.savedFoodItem.findFirst({where: {userId: user.id}})).toMatchObject({
    name: 'Overnight oats',
    calories: 350,
    isPinned: false,
  });
});

test.describe('Saved food suggestions', () => {
  test.beforeEach(async ({db, user}) => {
    await seedSavedFood(db, user.id, {
      name: 'Porridge',
      calories: 300,
      protein: 10,
      carbs: 50,
      fat: 5,
      saturatedFat: 1,
      isPinned: true,
    });
    await seedSavedFood(db, user.id, {name: 'Pancakes', calories: 400, isPinned: true});
    await seedSavedFood(db, user.id, {name: 'Apple', calories: 80});
    await seedSavedFood(db, user.id, {name: 'Avocado toast', calories: 320});
  });

  test('FOOD-07 pinned items first, then filtered by name', async ({authedPage: page}) => {
    const form = fields(await openFood(page));
    await form.name.focus();
    await expect(form.suggestions).toHaveText([/📌 Pancakes\s*400 kcal/, /📌 Porridge\s*300 kcal/]);

    await form.name.fill('A');
    // Case-insensitive substring match; pinned first, then A–Z.
    await expect(form.suggestions).toHaveText([/Pancakes/, /Apple/, /Avocado toast/]);

    await form.name.fill('zzz');
    await expect(form.suggestions).toHaveCount(0);

    // The open list covers the fields below, so blur the input directly.
    await form.name.fill('o');
    await expect(form.suggestions).not.toHaveCount(0);
    await form.name.blur();
    await expect(form.suggestions).toHaveCount(0);
  });

  test('FOOD-07 at most eight suggestions', async ({authedPage: page, db, user}) => {
    for (let i = 0; i < 10; i++) {
      await seedSavedFood(db, user.id, {name: `Snack bar ${i}`});
    }
    const form = fields(await openFood(page));
    await form.name.fill('snack');
    await expect(form.suggestions).toHaveCount(8);
  });

  test('FOOD-08 choosing a suggestion fills the form and upserts it', async ({
    authedPage: page,
    db,
    user,
  }) => {
    const form = fields(await openFood(page));
    await form.name.fill('porr');
    await form.suggestions.filter({hasText: 'Porridge'}).click();

    await expect(form.name).toHaveValue('Porridge');
    await expect(form.calories).toHaveValue('300');
    await expect(form.protein).toHaveValue('10');
    await expect(form.carbs).toHaveValue('50');
    await expect(form.fat).toHaveValue('5');
    await expect(form.saturatedFat).toHaveValue('1');
    await expect(form.save).toBeChecked();
    await expect(form.pin).toBeChecked();

    await form.calories.fill('320');
    const item = await db.savedFoodItem.findFirst({where: {userId: user.id, name: 'Porridge'}});
    const saved = nextApiRequest(page, '/api/saved-food');
    await form.submit.click();
    expect((await saved).postDataJSON()).toMatchObject({
      id: item!.id,
      name: 'Porridge',
      calories: 320,
      isPinned: true,
    });
    await expect(page.getByRole('dialog', {name: 'Log food'})).toBeHidden();
    expect((await db.savedFoodItem.findUnique({where: {id: item!.id}}))?.calories).toBe(320);
  });

  test('FOOD-09 a new item named like a saved one is not logged', async ({
    authedPage: page,
    db,
    user,
  }) => {
    const foodCalls = trackRequests(page, '/api/food');
    const form = fields(await openFood(page));
    await form.name.fill('Apple');
    await form.calories.fill('90');
    await form.save.check();
    await form.submit.click();

    await expect(panelAlert(page)).toHaveText('An item with this name already exists');
    expect(foodCalls).toEqual([]);
    expect(await db.foodLog.count({where: {userId: user.id}})).toBe(0);
  });

  test('FOOD-10 removing a saved item asks first', async ({authedPage: page, db, user}) => {
    const deletes = trackRequests(page, '/api/saved-food');
    const form = fields(await openFood(page));
    await form.name.focus();

    const dismissed = onNextDialog(page, 'dismiss');
    await form.suggestions.getByRole('button', {name: 'Remove Pancakes'}).click();
    expect(await dismissed).toBe(
      'Delete saved food "Pancakes"? This cannot be undone. Existing food logs will not be affected.',
    );
    expect(deletes.filter((call) => call.startsWith('DELETE'))).toEqual([]);

    void onNextDialog(page, 'accept');
    const request = nextApiRequest(page, '/api/saved-food', 'DELETE');
    await form.suggestions.getByRole('button', {name: 'Remove Pancakes'}).click();
    const response = await (await request).response();
    expect(await response?.json()).toEqual({success: true});

    await expect(form.suggestions).toHaveText([/Porridge/]);
    expect(await db.savedFoodItem.count({where: {userId: user.id, name: 'Pancakes'}})).toBe(0);
  });
});

test('FOOD-11 submit button shows progress', async ({authedPage: page}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/food', async (route) => {
    await held;
    await route.continue();
  });
  const form = fields(await openFood(page));
  await form.name.fill('Tea');
  await form.calories.fill('2');
  await form.submit.click();
  await expect(
    page.getByRole('dialog', {name: 'Log food'}).getByRole('button', {name: 'Saving...'}),
  ).toBeDisabled();
  release();
  await expect(page.getByRole('dialog', {name: 'Log food'})).toBeHidden();
});

test('FOOD-12 server failure leaves the dialog open without a message', async ({
  authedPage: page,
}) => {
  await page.route('**/api/food', (route) =>
    route.fulfill({status: 500, json: {error: 'Failed to log food'}}),
  );
  const panel = await openFood(page);
  const form = fields(panel);
  await form.name.fill('Tea');
  await form.calories.fill('2');
  const response = page.waitForResponse('**/api/food');
  await form.submit.click();
  await response;

  // FINDING: unlike the exercise form, no error is shown to the user.
  await expect(panel).toBeVisible();
  await expect(form.name).toHaveValue('Tea');
  await expect(form.submit).toBeEnabled();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('FOOD-13 no AI estimate when AI is off', async ({authedPage: page}) => {
  const form = fields(await openFood(page));
  await expect(
    page.getByRole('button', {name: 'Estimate nutrition with AI'}),
  ).toHaveCount(0);
  await expect(form.name).not.toHaveAttribute('placeholder');
});
