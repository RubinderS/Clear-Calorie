import {randomUUID} from 'node:crypto';
import type {Page} from '@playwright/test';
import {test, expect, nextApiRequest} from '../../fixtures/test';
import {EXERCISE_ESTIMATE} from '../../mocks/data';
import {dialog} from '../../fixtures/ui';

const marker = () => `m${randomUUID().slice(0, 8)}`;

async function openAddGoal(page: Page) {
  await page.goto('/exercise-plan');
  await page.getByRole('button', {name: 'Add exercise'}).click();
  const add = dialog(page, 'Add exercise');
  return {
    add,
    name: add.getByLabel('Exercise', {exact: true}),
    time: add.getByRole('button', {name: 'Time based'}),
    sets: add.getByLabel('Sets', {exact: true}),
    reps: add.getByLabel('Reps', {exact: true}),
    weight: add.getByLabel('Weight', {exact: true}),
    duration: add.getByLabel('Duration (min)'),
    // By role: the Estimate button's aria-label also mentions calories burned.
    calories: add.getByRole('spinbutton', {name: 'Calories burned (optional)'}),
    estimate: add.getByRole('button', {name: 'Estimate calories burned with AI'}),
    note: add.getByText(/^AI estimate\. Check before saving\./),
    alert: add.getByRole('alert'),
  };
}

test('AIE-01 strength estimate fills calories', async ({authedPage: page}) => {
  const f = await openAddGoal(page);
  await expect(f.estimate).toBeDisabled();

  const name = `Rows ${marker()}`;
  await f.name.fill(name);
  await f.sets.fill('3');
  const request = nextApiRequest(page, '/api/exercise/estimate');
  await f.estimate.click();
  // Empty fields are sent as null so a partly filled form can be estimated.
  expect((await request).postDataJSON()).toEqual({
    name,
    type: 'STRENGTH',
    sets: 3,
    reps: null,
    weight: null,
  });
  expect(await (await (await request).response())?.json()).toEqual(EXERCISE_ESTIMATE);

  await expect(f.calories).toHaveValue(String(EXERCISE_ESTIMATE.calories));
  await expect(f.note).toHaveText(
    `AI estimate. Check before saving. ${EXERCISE_ESTIMATE.assumptions}`,
  );

  // Editing calories by hand removes the AI note.
  await f.calories.fill('300');
  await expect(f.note).toHaveCount(0);
});

test('AIE-01 time estimate sends the duration', async ({authedPage: page}) => {
  const f = await openAddGoal(page);
  const name = `Cycling ${marker()}`;
  await f.name.fill(name);
  await f.time.click();
  await f.duration.fill('45');
  const request = nextApiRequest(page, '/api/exercise/estimate');
  await f.estimate.click();
  expect((await request).postDataJSON()).toEqual({name, type: 'TIME', durationMin: 45});
  await expect(f.calories).toHaveValue(String(EXERCISE_ESTIMATE.calories));
});

test('AIE-02 the prompt includes body weight and load', async ({
  authedPage: page,
  api,
  mock,
}) => {
  const before = marker();
  await api.post('/api/exercise/estimate', {
    data: {name: `Squat ${before}`, type: 'STRENGTH', sets: 3, reps: 10, weight: 50},
  });
  const [unknown] = await mock.requests(before);
  expect(unknown.body.messages[1].content).toBe(
    [
      `Exercise: Squat ${before}`,
      'Sets: 3',
      'Reps: 10',
      'Load: 50 kg',
      'Body weight: not known; assume an average adult.',
    ].join('\n'),
  );

  await api.post('/api/weight', {data: {weight: 80}});
  const after = marker();
  const f = await openAddGoal(page);
  await f.name.fill(`Walk ${after}`);
  await f.time.click();
  await f.duration.fill('30');
  const response = page.waitForResponse('**/api/exercise/estimate');
  await f.estimate.click();
  await response;
  const [known] = await mock.requests(after);
  expect(known.body.messages[1].content).toBe(
    [`Exercise: Walk ${after}`, 'Duration: 30 min', 'Body weight: 80 kg'].join('\n'),
  );
  expect(known.body.messages[0].content).toMatch(/^You are an exercise energy expenditure/);
});

test('AIE-03 failures ask for manual calories', async ({authedPage: page}) => {
  const f = await openAddGoal(page);
  for (const scenario of ['error500', 'missing-calories']) {
    await f.name.fill(`Mystery [ai:${scenario}] ${marker()}`);
    const response = page.waitForResponse('**/api/exercise/estimate');
    await f.estimate.click();
    expect((await response).status()).toBe(502);
    await expect(f.alert).toHaveText(
      'Could not estimate this exercise. Please enter calories manually.',
    );
  }
});

test.describe('AIE-04 exercise estimate API validation', () => {
  for (const [label, body] of [
    ['empty name', {name: '', type: 'TIME'}],
    ['name over 100 chars', {name: 'x'.repeat(101), type: 'TIME'}],
    ['unknown type', {name: 'x', type: 'CARDIO'}],
    ['sets 0', {name: 'x', type: 'STRENGTH', sets: 0}],
    ['decimal reps', {name: 'x', type: 'STRENGTH', reps: 2.5}],
    ['negative weight', {name: 'x', type: 'STRENGTH', weight: -1}],
    ['duration over 10000', {name: 'x', type: 'TIME', durationMin: 10_001}],
  ] as const) {
    test(`${label} → 400`, async ({api}) => {
      const response = await api.post('/api/exercise/estimate', {data: body});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }
});
