import {format, parseISO} from 'date-fns';
import {test, expect, nextApiRequest, onNextDialog, trackRequests} from '../../fixtures/test';
import {seedWeight} from '../../fixtures/db';
import {daysAgoIn, noonDaysAgo} from '../../fixtures/dates';
import {calorieSummary, card, macroRing, openQuickLog} from '../../fixtures/ui';

const weightDate = (days: number) => format(parseISO(daysAgoIn(days)), 'MMM dd, yyyy');

test.describe('Weight', () => {
  test('WT-01 quick-log a weight', async ({authedPage: page, db, user}) => {
    await page.goto('/dashboard');
    const panel = await openQuickLog(page, 'body');
    await panel.getByLabel('Weight').fill('72.5');

    const request = nextApiRequest(page, '/api/weight');
    await panel.getByRole('button', {name: 'Log weight'}).click();
    const sent = await request;
    expect(sent.postDataJSON()).toEqual({weight: 72.5});
    expect((await sent.response())?.status()).toBe(201);
    await expect(panel).toBeHidden();
    expect((await db.weightLog.findFirst({where: {userId: user.id}}))?.weight).toBe(72.5);

    await page.goto('/logs?tab=body');
    await expect(card(page, 'Weight').getByRole('listitem')).toHaveText([/72\.5/]);
  });

  test('WT-02 browser validation', async ({authedPage: page}) => {
    const calls = trackRequests(page, '/api/weight');
    await page.goto('/dashboard');
    const panel = await openQuickLog(page, 'body');
    const input = panel.getByLabel('Weight');
    const submit = panel.getByRole('button', {name: 'Log weight'});

    await submit.click();
    await expect(input).toHaveJSProperty('validity.valueMissing', true);
    await input.fill('72.55');
    await submit.click();
    await expect(input).toHaveJSProperty('validity.stepMismatch', true);
    await input.fill('-1');
    await submit.click();
    await expect(input).toHaveJSProperty('validity.rangeUnderflow', true);
    expect(calls).toEqual([]);
  });

  test('WT-03 chart above five entries, the rest scroll', async ({authedPage: page, db, user}) => {
    for (let days = 11; days >= 0; days--) {
      await seedWeight(db, user.id, {weight: 70 + days, loggedAt: noonDaysAgo(days)});
    }
    await page.goto('/logs?tab=body');
    const weight = card(page, 'Weight');
    // The chart and list cover everything loaded (up to 30), newest first.
    await expect(weight.locator('.recharts-area-dots circle')).toHaveCount(12);
    const items = weight.getByRole('listitem');
    await expect(items).toHaveCount(12);
    await expect(items.first()).toContainText('70');
    await expect(items.first()).toContainText(weightDate(0));
    await expect(items.last()).toContainText(weightDate(11));

    const list = weight.getByRole('region', {name: 'Weight entries'});
    await list.scrollIntoViewIfNeeded();
    await expect(items.nth(4)).toBeInViewport();
    await expect(items.last()).not.toBeInViewport();
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await list.evaluate((el) => el.scrollTo({top: el.scrollHeight}));
    await expect(items.last()).toBeInViewport();
  });

  test('WT-03b a short list does not scroll', async ({authedPage: page, db, user}) => {
    for (let days = 4; days >= 0; days--) {
      await seedWeight(db, user.id, {loggedAt: noonDaysAgo(days)});
    }
    await page.goto('/logs?tab=body');
    await expect(card(page, 'Weight').getByRole('listitem')).toHaveCount(5);
    await expect(page.getByRole('region', {name: 'Weight entries'})).toHaveCount(0);
  });

  test('WT-04 empty state', async ({authedPage: page}) => {
    await page.goto('/logs?tab=body');
    await expect(page.getByText('No weight entries yet.')).toBeVisible();
  });

  test('WT-05 delete any entry after confirming', async ({authedPage: page, db, user}) => {
    const old = await seedWeight(db, user.id, {weight: 81, loggedAt: noonDaysAgo(4)});
    await seedWeight(db, user.id, {weight: 80});
    await page.goto('/logs?tab=body');

    const label = `Delete weight entry from ${weightDate(4)}`;
    const dismissed = onNextDialog(page, 'dismiss');
    await page.getByRole('button', {name: label}).click();
    expect(await dismissed).toBe(`${label}? This cannot be undone.`);
    expect(await db.weightLog.count({where: {id: old.id}})).toBe(1);

    void onNextDialog(page, 'accept');
    const request = nextApiRequest(page, '/api/weight', 'DELETE');
    await page.getByRole('button', {name: label}).click();
    expect((await (await request).response())?.status()).toBe(204);
    await expect(page.getByRole('button', {name: label})).toHaveCount(0);
    await expect(card(page, 'Weight').getByRole('listitem')).toHaveCount(1);
  });
});

test.describe('Food goal', () => {
  const fields = (page: import('@playwright/test').Page) => ({
    calories: page.getByLabel('Calories'),
    protein: page.getByLabel('Protein (g)'),
    carbs: page.getByLabel('Carbs (g)'),
    fat: page.getByLabel('Fat (g)', {exact: true}),
    saturatedFat: page.getByLabel('of which saturated fat (g)'),
    submit: page.getByRole('button', {name: 'Save food goal'}),
  });

  test('FG-01 defaults are prefilled', async ({authedPage: page}) => {
    await page.goto('/food-goal');
    await expect(page.getByText('Set your daily nutrition targets')).toBeVisible();
    const f = fields(page);
    await expect(f.calories).toHaveValue('2000');
    await expect(f.protein).toHaveValue('150');
    await expect(f.carbs).toHaveValue('250');
    await expect(f.fat).toHaveValue('70');
    await expect(f.saturatedFat).toHaveValue('20');
  });

  test('FG-02 saving persists and drives the dashboard', async ({
    authedPage: page,
    db,
    user,
  }) => {
    await page.goto('/food-goal');
    const f = fields(page);
    await f.calories.fill('1800');
    await f.protein.fill('140');
    await f.carbs.fill('200');
    await f.fat.fill('60');
    await f.saturatedFat.fill('15');

    const request = nextApiRequest(page, '/api/goals');
    await f.submit.click();
    const sent = await request;
    // AI is off, so health notes aren't sent (and can't be wiped).
    expect(sent.postDataJSON()).toEqual({
      calorieGoal: 1800,
      proteinGoal: 140,
      carbsGoal: 200,
      fatGoal: 60,
      saturatedFatGoal: 15,
    });
    expect((await sent.response())?.status()).toBe(200);

    await page.reload();
    await expect(f.calories).toHaveValue('1800');
    await expect(f.saturatedFat).toHaveValue('15');

    await page.goto('/dashboard');
    await expect(calorieSummary(page).ratio).toHaveText('0 / 1800');
    await expect(macroRing(page, 'Protein').ratio).toHaveText('0 / 140');
    expect((await db.goal.findUnique({where: {userId: user.id}}))?.calorieGoal).toBe(1800);
  });

  test('FG-03 saturated fat goal cannot exceed fat goal', async ({authedPage: page}) => {
    const calls = trackRequests(page, '/api/goals');
    await page.goto('/food-goal');
    const f = fields(page);
    await f.fat.fill('10');
    await f.saturatedFat.fill('11');
    await f.submit.click();
    await expect(page.getByText('Saturated fat goal cannot exceed total fat goal.')).toBeVisible();
    await expect(f.saturatedFat).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toEqual([]);

    await f.calories.fill('');
    await f.saturatedFat.fill('5');
    await f.submit.click();
    await expect(f.calories).toHaveJSProperty('validity.valueMissing', true);
    expect(calls).toEqual([]);
  });

  test('FG-04 health notes are hidden and kept when AI is off', async ({
    authedPage: page,
    db,
    user,
  }) => {
    await db.goal.update({where: {userId: user.id}, data: {healthNotes: 'Low sodium'}});
    await page.goto('/food-goal');
    await expect(page.getByLabel('Health notes')).toHaveCount(0);
    await fields(page).calories.fill('1900');
    const response = page.waitForResponse('**/api/goals');
    await fields(page).submit.click();
    await response;
    expect(await db.goal.findUnique({where: {userId: user.id}})).toMatchObject({
      calorieGoal: 1900,
      healthNotes: 'Low sodium',
    });
  });

  test('FG-05 save button shows progress', async ({authedPage: page}) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/goals', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/food-goal');
    await fields(page).submit.click();
    await expect(page.getByRole('button', {name: 'Saving...'})).toBeDisabled();
    release();
    await expect(fields(page).submit).toBeEnabled();
  });
});
