import {randomUUID} from 'node:crypto';
import type {Locator, Page} from '@playwright/test';
import {test, expect, nextApiRequest, nextApiResponse} from '../../fixtures/test';
import {seedSavedFood} from '../../fixtures/db';
import {FOOD_ESTIMATE, HEALTH_ALERTS} from '../../mocks/data';
import {dialog, logRow, openQuickLog} from '../../fixtures/ui';

const marker = () => `m${randomUUID().slice(0, 8)}`;

function foodForm(panel: Locator) {
  return {
    name: panel.getByLabel('Food name'),
    calories: panel.getByLabel('Calories', {exact: true}),
    protein: panel.getByLabel('Protein (g)'),
    carbs: panel.getByLabel('Carbs (g)'),
    fat: panel.getByLabel('Fat (g)', {exact: true}),
    saturatedFat: panel.getByLabel('of which saturated (g)'),
    estimate: panel.getByRole('button', {name: 'Estimate nutrition with AI'}),
    submit: panel.getByRole('button', {name: 'Log food'}),
    note: panel.getByText(/^AI estimate\. Check before logging\./),
    alert: panel.getByRole('alert'),
  };
}

async function openFood(page: Page) {
  await page.goto('/dashboard');
  return openQuickLog(page, 'food');
}

async function estimate(page: Page, form: ReturnType<typeof foodForm>, description: string) {
  await form.name.fill(description);
  const response = nextApiResponse(page, '/api/food/estimate');
  await form.estimate.click();
  return response;
}

test('AIF-01 estimate fills the form for review', async ({authedPage: page}) => {
  const panel = await openFood(page);
  const f = foodForm(panel);
  await expect(f.name).toHaveAttribute('placeholder', 'e.g. 2 eggs on toast with butter');
  await expect(f.estimate).toBeDisabled();
  await f.name.fill('   ');
  await expect(f.estimate).toBeDisabled();

  const description = `2 eggs on toast ${marker()}`;
  await f.name.fill(description);
  const request = nextApiRequest(page, '/api/food/estimate');
  await f.estimate.click();
  expect((await request).postDataJSON()).toEqual({description});
  const response = await (await request).response();
  expect(response?.status()).toBe(200);
  expect(await response?.json()).toEqual(FOOD_ESTIMATE);

  await expect(f.name).toHaveValue(FOOD_ESTIMATE.name);
  await expect(f.calories).toHaveValue(String(FOOD_ESTIMATE.calories));
  await expect(f.protein).toHaveValue(String(FOOD_ESTIMATE.protein));
  await expect(f.carbs).toHaveValue(String(FOOD_ESTIMATE.carbs));
  await expect(f.fat).toHaveValue(String(FOOD_ESTIMATE.fat));
  await expect(f.saturatedFat).toHaveValue(String(FOOD_ESTIMATE.saturatedFat));
  await expect(f.note).toHaveText(
    `AI estimate. Check before logging. ${FOOD_ESTIMATE.assumptions}`,
  );

  const logged = nextApiRequest(page, '/api/food');
  await f.submit.click();
  expect((await logged).postDataJSON()).toEqual({
    name: FOOD_ESTIMATE.name,
    calories: FOOD_ESTIMATE.calories,
    protein: FOOD_ESTIMATE.protein,
    carbs: FOOD_ESTIMATE.carbs,
    fat: FOOD_ESTIMATE.fat,
    saturatedFat: FOOD_ESTIMATE.saturatedFat,
    healthAlert: null,
  });
});

test('AIF-01 button shows progress while estimating', async ({authedPage: page}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/food/estimate', async (route) => {
    await held;
    await route.continue();
  });
  const f = foodForm(await openFood(page));
  await f.name.fill('Banana');
  await f.estimate.click();
  await expect(f.estimate).toBeDisabled();
  await expect(f.estimate).toHaveText('Estimating...');
  release();
  await expect(f.estimate).toHaveText('Estimate');
});

test.describe('With health notes', () => {
  test.beforeEach(async ({api}) => {
    await api.post('/api/goals', {data: {healthNotes: 'High LDL cholesterol'}});
  });

  test('AIF-02 avoid alert is shown, logged and badged', async ({authedPage: page}) => {
    const panel = await openFood(page);
    const f = foodForm(panel);
    await estimate(page, f, `Fried chicken [ai:avoid] ${marker()}`);

    const alert = panel.getByRole('alert').filter({hasText: 'Heads up'});
    await expect(alert).toHaveText(`Heads up: ${HEALTH_ALERTS.avoid.message}`);
    await expect(alert).toHaveClass(/red/);

    const logged = nextApiRequest(page, '/api/food');
    await f.submit.click();
    expect((await logged).postDataJSON().healthAlert).toEqual(HEALTH_ALERTS.avoid);

    await page.goto('/logs');
    await logRow(page, FOOD_ESTIMATE.name)
      .getByRole('button', {name: `Show health alert for ${FOOD_ESTIMATE.name}`})
      .click();
    await expect(dialog(page, 'Health alert')).toContainText('Best avoided');
    await expect(dialog(page, 'Health alert')).toContainText(HEALTH_ALERTS.avoid.message);
  });

  test('AIF-02 caution alert is amber', async ({authedPage: page}) => {
    const panel = await openFood(page);
    await estimate(page, foodForm(panel), `Ramen [ai:caution] ${marker()}`);
    const alert = panel.getByRole('alert').filter({hasText: 'Heads up'});
    await expect(alert).toHaveText(`Heads up: ${HEALTH_ALERTS.caution.message}`);
    await expect(alert).toHaveClass(/amber/);
  });

  test('AIF-03 fine or malformed health checks show no alert', async ({authedPage: page}) => {
    const panel = await openFood(page);
    const f = foodForm(panel);
    for (const scenario of ['ok', 'bad-alert']) {
      const response = await estimate(page, f, `Salad [ai:${scenario}] ${marker()}`);
      expect(response.status()).toBe(200);
      expect(await response.json()).not.toHaveProperty('healthAlert');
      await expect(f.calories).toHaveValue(String(FOOD_ESTIMATE.calories));
      await expect(panel.getByText('Heads up')).toHaveCount(0);
    }
  });

  test('AIF-04 renaming after an estimate drops the alert', async ({authedPage: page}) => {
    const panel = await openFood(page);
    const f = foodForm(panel);
    await estimate(page, f, `Pie [ai:avoid] ${marker()}`);
    await expect(panel.getByText('Heads up')).toBeVisible();
    await f.name.fill('Something else');
    await expect(panel.getByText('Heads up')).toHaveCount(0);

    const logged = nextApiRequest(page, '/api/food');
    await f.submit.click();
    expect((await logged).postDataJSON().healthAlert).toBeNull();
  });

  test('AIF-07 notes come from the database, not the request', async ({api, mock}) => {
    const withNotes = marker();
    await api.post('/api/food/estimate', {
      data: {description: `Cheese ${withNotes}`, healthNotes: 'SPOOFED NOTES'},
    });
    const [request] = await mock.requests(withNotes);
    const system = request.body.messages[0].content;
    expect(system).toContain('<health_notes>\nHigh LDL cholesterol\n</health_notes>');
    expect(system).not.toContain('SPOOFED');
  });
});

test('AIF-05 AI failures fall back to manual entry', async ({authedPage: page}) => {
  const panel = await openFood(page);
  const f = foodForm(panel);
  for (const scenario of ['error500', 'invalid', 'missing-calories', 'empty']) {
    const response = await estimate(page, f, `Mystery [ai:${scenario}] ${marker()}`);
    expect(response.status(), scenario).toBe(502);
    await expect(f.alert).toHaveText(
      'Could not estimate this food. Please enter values manually.',
    );
    await expect(f.calories).toHaveValue('');
  }
});

test('AIF-06 estimates are normalised', async ({authedPage: page}) => {
  const f = foodForm(await openFood(page));

  await estimate(page, f, `Fenced [ai:fenced] ${marker()}`);
  await expect(f.calories).toHaveValue(String(FOOD_ESTIMATE.calories));

  const overflow = await estimate(page, f, `Huge [ai:overflow] ${marker()}`);
  expect(await overflow.json()).toMatchObject({
    name: 'N'.repeat(60),
    calories: 513,
    protein: 12.3,
    fat: 10,
    saturatedFat: 10,
  });
  await expect(f.saturatedFat).toHaveValue('10');

  const strings = await estimate(page, f, `Strings [ai:strings] ${marker()}`);
  expect(await strings.json()).toMatchObject({calories: 250, protein: 7.5});
});

test('AIF-07 request contract with the AI service', async ({api, mock}) => {
  const id = marker();
  await api.post('/api/food/estimate', {data: {description: `Pho ${id}`}});
  const requests = await mock.requests(id);
  expect(requests).toHaveLength(1);
  const [request] = requests;
  expect(request.authorization).toBe('Bearer test-key');
  expect(request.body).toMatchObject({
    model: 'mock-model',
    temperature: 0.2,
    response_format: {type: 'json_object'},
  });
  expect(request.body.messages.map((m) => m.role)).toEqual(['system', 'user']);
  expect(request.body.messages[1].content).toBe(`Pho ${id}`);
  // No notes saved, so no health check is requested.
  expect(request.body.messages[0].content).not.toContain('<health_notes>');
  expect(request.body.messages[0].content).toContain('Australian');
});

test.describe('AIF-08 estimate API validation', () => {
  for (const [label, body] of [
    ['empty description', {description: ''}],
    ['blank description', {description: '   '}],
    ['description over 300 chars', {description: 'x'.repeat(301)}],
    ['missing description', {}],
  ] as const) {
    test(`${label} → 400`, async ({api}) => {
      const response = await api.post('/api/food/estimate', {data: body});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }

  test('malformed JSON → 400', async ({api}) => {
    const response = await api.post('/api/food/estimate', {
      headers: {'Content-Type': 'application/json'},
      data: Buffer.from('{nope'),
    });
    expect(response.status()).toBe(400);
  });

  test('SEC-02 signed-out callers get 401', async ({request}) => {
    for (const path of ['/api/food/estimate', '/api/exercise/estimate']) {
      const response = await request.post(path, {data: {description: 'x'}});
      expect(response.status()).toBe(401);
    }
  });
});

test('AIF-09 health notes on the food goal page', async ({authedPage: page, db, user}) => {
  await page.goto('/food-goal');
  const notes = page.getByLabel('Health notes');
  await expect(notes).toHaveAttribute('maxlength', '500');
  await expect(notes).toHaveAttribute('placeholder', 'e.g. High LDL cholesterol, keep sodium low');
  await expect(page.getByText('0/500')).toBeVisible();
  await expect(page.getByText(/Notes are sent to the AI service\. Not medical advice\./)).toBeVisible();

  await notes.fill('  Low sodium  ');
  await expect(page.getByText('14/500')).toBeVisible();
  let request = nextApiRequest(page, '/api/goals');
  await page.getByRole('button', {name: 'Save food goal'}).click();
  expect((await request).postDataJSON()).toMatchObject({healthNotes: 'Low sodium'});
  await expect
    .poll(async () => (await db.goal.findUnique({where: {userId: user.id}}))?.healthNotes)
    .toBe('Low sodium');

  await page.reload();
  await expect(notes).toHaveValue('Low sodium');
  await notes.fill('   ');
  request = nextApiRequest(page, '/api/goals');
  await page.getByRole('button', {name: 'Save food goal'}).click();
  expect((await request).postDataJSON()).toMatchObject({healthNotes: null});
});

test('AIF-10 rate limiting is reported', async ({authedPage: page}) => {
  await page.route('**/api/food/estimate', (route) =>
    route.fulfill({status: 429, json: {error: 'Too many AI requests. Please try again later.'}}),
  );
  const f = foodForm(await openFood(page));
  await f.name.fill('Banana');
  await f.estimate.click();
  await expect(f.alert).toHaveText('Too many AI requests. Please try again later.');
});

test('AIF-13 picking a saved food clears the AI note', async ({authedPage: page, db, user}) => {
  await seedSavedFood(db, user.id, {name: 'Porridge', calories: 300, isPinned: true});
  const panel = await openFood(page);
  const f = foodForm(panel);
  await estimate(page, f, `Oats ${marker()}`);
  await expect(f.note).toBeVisible();

  // Clicking Estimate blurred the input, which hides suggestions 150 ms later.
  // Let that timer run out so it can't close the list opened below.
  await page.waitForTimeout(200);
  await f.name.fill('Porr');
  await panel.getByRole('listitem').filter({hasText: 'Porridge'}).click();
  await expect(f.calories).toHaveValue('300');
  await expect(f.note).toHaveCount(0);
});
