import {test, expect} from '../../fixtures/test';
import {signInOrThrow} from '../../fixtures/auth';
import {seedExerciseGoal, seedFood} from '../../fixtures/db';
import {daysAgoIn, instantAt, shiftDate, todayIn, weekdayIn} from '../../fixtures/dates';
import {calorieSummary, card, logRow, openQuickLog} from '../../fixtures/ui';

// UTC+14 and UTC-11: 25 hours apart, so their calendar dates never match.
const KIRITIMATI = 'Pacific/Kiritimati';
const PAGO_PAGO = 'Pacific/Pago_Pago';

test.describe('TZ-01 timezone cookie', () => {
  // Not Asia/Kolkata: Chromium reports it by its legacy name, Asia/Calcutta.
  test.use({timezoneId: 'Europe/Berlin'});

  test('is set from the browser and the page re-renders', async ({page, user, baseURL}) => {
    await signInOrThrow(page.context().request, user.email, user.password);
    await page.goto('/dashboard');
    await expect
      .poll(async () => (await page.context().cookies(baseURL)).find((c) => c.name === 'tz')?.value)
      .toBe('Europe/Berlin');
    const cookie = (await page.context().cookies(baseURL)).find((c) => c.name === 'tz')!;
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 60 * 60);
  });
});

test('TZ-01 fixture cookie already matches, so no resync happens', async ({
  authedPage: page,
  baseURL,
}) => {
  await page.goto('/dashboard');
  const detected = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const cookie = (await page.context().cookies(baseURL)).find((c) => c.name === 'tz');
  expect(cookie?.value).toBe(detected);
});

test('TZ-02 an invalid tz cookie falls back to UTC', async ({apiAs, user, db}) => {
  await seedFood(db, user.id, {name: 'UTC breakfast', loggedAt: instantAt(todayIn(), '00:05')});
  const api = await apiAs(user, {timeZone: 'Not/AZone'});
  const response = await api.get(`/api/food?date=${todayIn()}`);
  expect(response.status()).toBe(200);
  expect((await response.json()).map((e: {name: string}) => e.name)).toEqual(['UTC breakfast']);
});

test('TZ-03 API day ranges follow the user’s timezone', async ({apiAs, user, db}) => {
  // 00:30 on a past Kiritimati day is 10:30 the previous day in UTC.
  const day = daysAgoIn(3, KIRITIMATI);
  const entry = await seedFood(db, user.id, {
    name: 'Island breakfast',
    loggedAt: instantAt(day, '00:30', KIRITIMATI),
  });

  const island = await apiAs(user, {timeZone: KIRITIMATI});
  expect(await (await island.get(`/api/food?date=${day}`)).json()).toMatchObject([
    {id: entry.id},
  ]);

  const utc = await apiAs(user, {timeZone: 'UTC'});
  expect(await (await utc.get(`/api/food?date=${day}`)).json()).toEqual([]);
  expect(await (await utc.get(`/api/food?date=${shiftDate(day, -1)}`)).json()).toMatchObject([
    {id: entry.id},
  ]);
});

test('TZ-03 "today" for edits follows the user’s timezone', async ({apiAs, user, db}) => {
  const today = todayIn(KIRITIMATI);
  const startOfToday = instantAt(today, '00:01', KIRITIMATI);
  const lateYesterday = new Date(startOfToday.getTime() - 2 * 60 * 1000);
  const todays = await seedFood(db, user.id, {loggedAt: startOfToday});
  const yesterdays = await seedFood(db, user.id, {loggedAt: lateYesterday});

  const island = await apiAs(user, {timeZone: KIRITIMATI});
  const edit = (id: string) => island.patch('/api/food', {data: {id, name: 'Edited', calories: 1}});
  expect((await edit(todays.id)).status()).toBe(200);
  expect((await edit(yesterdays.id)).status()).toBe(403);
});

test.describe('TZ-03 pages in Kiritimati', () => {
  test.use({timezoneId: KIRITIMATI});

  test('dashboard totals and log times use local days', async ({
    authedPage: page,
    db,
    user,
  }) => {
    const today = todayIn(KIRITIMATI);
    const startOfToday = instantAt(today, '00:01', KIRITIMATI);
    await seedFood(db, user.id, {name: 'Local today', calories: 400, loggedAt: startOfToday});
    await seedFood(db, user.id, {
      name: 'Local yesterday',
      calories: 999,
      loggedAt: new Date(startOfToday.getTime() - 2 * 60 * 1000),
    });

    await page.goto('/dashboard');
    await expect(calorieSummary(page).eaten).toHaveText('400');

    await page.goto('/logs');
    const row = logRow(page, 'Local today');
    await expect(row).toContainText('12:01 AM');
    await expect(row.getByRole('button', {name: 'Edit Local today'})).toBeEnabled();
    await expect(logRow(page, 'Local yesterday')).toHaveCount(0);

    await page.getByRole('button', {name: 'Previous day'}).click();
    await expect(logRow(page, 'Local yesterday')).toContainText('11:59 PM');
  });

  test('TZ-04 the plan uses the local weekday and date', async ({authedPage: page, db, user}) => {
    const goal = await seedExerciseGoal(db, user.id, {
      name: 'Island swim',
      days: [weekdayIn(KIRITIMATI)],
    });
    await page.goto('/dashboard');
    const panel = await openQuickLog(page, 'exercise');
    const response = page.waitForResponse('**/api/exercise-goals/log');
    await card(panel, "Today's plan")
      .getByRole('checkbox', {name: 'Mark Island swim as done'})
      .click();
    expect(await (await response).json()).toMatchObject({
      exerciseGoalId: goal.id,
      goalDate: todayIn(KIRITIMATI),
    });
  });
});

test.describe('TZ-04 the same plan in Pago Pago', () => {
  test.use({timezoneId: PAGO_PAGO});

  test("a goal for Kiritimati's weekday isn't planned here today", async ({
    authedPage: page,
    db,
    user,
  }) => {
    await seedExerciseGoal(db, user.id, {name: 'Island swim', days: [weekdayIn(KIRITIMATI)]});
    await page.goto('/dashboard');
    const panel = await openQuickLog(page, 'exercise');
    // Nothing planned here today, so the custom form shows directly.
    await expect(panel.getByRole('heading', {name: 'Add custom exercise'})).toBeVisible();
    await expect(panel.getByText('Island swim')).toHaveCount(0);
  });
});
