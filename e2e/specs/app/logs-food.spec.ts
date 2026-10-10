import {test, expect, nextApiRequest, onNextDialog} from '../../fixtures/test';
import {seedFood} from '../../fixtures/db';
import {daysAgoIn, instantAt, longDate, noonDaysAgo, todayIn} from '../../fixtures/dates';
import {card, dialog, logRow} from '../../fixtures/ui';

test('FL-01 tabs switch the URL and default to food', async ({authedPage: page}) => {
  await page.goto('/logs');
  const tabs = page.getByRole('navigation', {name: 'Log type'});
  await expect(tabs.getByRole('link', {name: 'Food'})).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', {name: "Today's entries"})).toBeVisible();

  await tabs.getByRole('link', {name: 'Exercise'}).click();
  await expect(page).toHaveURL('/logs?tab=exercise');
  await expect(tabs.getByRole('link', {name: 'Exercise'})).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', {name: "Today's workouts"})).toBeVisible();

  await tabs.getByRole('link', {name: 'Weight'}).click();
  await expect(page).toHaveURL('/logs?tab=weight');
  await expect(page.getByRole('heading', {name: 'Recent entries'})).toBeVisible();

  await page.goto('/logs?tab=bogus');
  await expect(tabs.getByRole('link', {name: 'Food'})).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', {name: 'Dashboard', exact: true}).first().click();
  await expect(page).toHaveURL('/dashboard');
});

test("FL-02 today's entries with totals, macros and local times", async ({
  authedPage: page,
  db,
  user,
}) => {
  const today = todayIn();
  await seedFood(db, user.id, {
    name: 'Eggs',
    calories: 150.5,
    protein: 12,
    carbs: 1,
    fat: 10,
    saturatedFat: 3,
    loggedAt: instantAt(today, '00:05'),
  });
  await seedFood(db, user.id, {name: 'Toast', calories: 200, loggedAt: instantAt(today, '00:15')});
  await page.goto('/logs?tab=food');

  const list = card(page, "Today's entries");
  await expect(list.getByText('350.5 calories')).toBeVisible();
  // Newest first.
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').first()).toContainText('Toast');

  const eggs = logRow(page, 'Eggs');
  await expect(eggs).toContainText('P: 12g · C: 1g · F: 10g · Sat: 3g');
  await expect(eggs).toContainText('150.5 kcal');
  await expect(eggs).toContainText('12:05 AM');
  await expect(eggs.getByRole('button', {name: 'Edit Eggs'})).toBeEnabled();
  await expect(eggs.getByRole('button', {name: 'Delete Eggs'})).toBeEnabled();
});

test('FL-03 empty day', async ({authedPage: page}) => {
  await page.goto('/logs');
  await expect(page.getByText('No food logged today.')).toBeVisible();
  await expect(page.getByText('0 calories')).toBeVisible();
});

test('FL-04 browsing past days is read-only', async ({authedPage: page, db, user}) => {
  await seedFood(db, user.id, {name: 'Old pasta', calories: 650, loggedAt: noonDaysAgo(1)});
  await page.goto('/logs');

  const dateInput = page.getByLabel('View food logs for date');
  await expect(dateInput).toHaveValue(todayIn());
  await expect(dateInput).toHaveAttribute('max', todayIn());
  await expect(page.getByRole('button', {name: 'Next day'})).toBeDisabled();

  const fetched = page.waitForRequest(`**/api/food?date=${daysAgoIn(1)}`);
  await page.getByRole('button', {name: 'Previous day'}).click();
  await fetched;
  await expect(page.getByRole('heading', {name: longDate(daysAgoIn(1))})).toBeVisible();
  const row = logRow(page, 'Old pasta');
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', {name: 'Edit Old pasta'})).toBeDisabled();
  await expect(row.getByRole('button', {name: 'Delete Old pasta'})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Next day'})).toBeEnabled();

  await dateInput.fill(daysAgoIn(3));
  await expect(page.getByText('No food logged on this date.')).toBeVisible();

  await dateInput.fill(daysAgoIn(1));
  await page.getByRole('button', {name: 'Next day'}).click();
  await expect(page.getByRole('heading', {name: "Today's entries"})).toBeVisible();
});

test.describe('FL-05 editing an entry', () => {
  test('saves corrections in place', async ({authedPage: page, db, user}) => {
    const entry = await seedFood(db, user.id, {
      name: 'Big burrito',
      calories: 900,
      protein: 40,
      fat: 30,
      saturatedFat: 12,
    });
    await page.goto('/logs');
    await logRow(page, 'Big burrito').getByRole('button', {name: 'Edit Big burrito'}).click();

    const edit = dialog(page, 'Edit food');
    await expect(edit.getByLabel('Food name')).toHaveValue('Big burrito');
    await expect(edit.getByLabel('Calories', {exact: true})).toHaveValue('900');
    await expect(edit.getByLabel('Protein (g)')).toHaveValue('40');
    await expect(edit.getByLabel('Saturated fat (g)')).toHaveValue('12');

    await edit.getByLabel('Food name').fill('Half burrito');
    await edit.getByLabel('Calories', {exact: true}).fill('450');
    await edit.getByLabel('Protein (g)').fill('20');
    await edit.getByLabel('Fat (g)', {exact: true}).fill('15');
    await edit.getByLabel('Saturated fat (g)').fill('6');

    const request = nextApiRequest(page, '/api/food', 'PATCH');
    await edit.getByRole('button', {name: 'Save changes'}).click();
    expect((await request).postDataJSON()).toEqual({
      id: entry.id,
      name: 'Half burrito',
      calories: 450,
      protein: 20,
      carbs: 0,
      fat: 15,
      saturatedFat: 6,
    });

    await expect(edit).toBeHidden();
    await expect(logRow(page, 'Half burrito')).toContainText('450 kcal');
    await expect(page.getByText('450 calories')).toBeVisible();
    expect((await db.foodLog.findUnique({where: {id: entry.id}}))?.name).toBe('Half burrito');
  });

  test('validates saturated fat and shows server errors', async ({
    authedPage: page,
    db,
    user,
  }) => {
    await seedFood(db, user.id, {name: 'Chips', calories: 300, fat: 10, saturatedFat: 2});
    await page.goto('/logs');
    await logRow(page, 'Chips').getByRole('button', {name: 'Edit Chips'}).click();
    const edit = dialog(page, 'Edit food');

    await edit.getByLabel('Saturated fat (g)').fill('20');
    await edit.getByRole('button', {name: 'Save changes'}).click();
    await expect(edit.getByRole('alert')).toHaveText('Saturated fat cannot exceed total fat');

    await page.route('**/api/food', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({status: 403, json: {error: "Only today's entries can be edited"}})
        : route.continue(),
    );
    await edit.getByLabel('Saturated fat (g)').fill('1');
    await edit.getByRole('button', {name: 'Save changes'}).click();
    await expect(edit.getByRole('alert')).toHaveText("Only today's entries can be edited");
  });
});

test('FL-06 deleting asks for confirmation', async ({authedPage: page, db, user}) => {
  await seedFood(db, user.id, {name: 'Donut', calories: 250});
  await seedFood(db, user.id, {name: 'Salad', calories: 150});
  await page.goto('/logs');
  await expect(page.getByText('400 calories')).toBeVisible();

  const dismissed = onNextDialog(page, 'dismiss');
  await logRow(page, 'Donut').getByRole('button', {name: 'Delete Donut'}).click();
  expect(await dismissed).toBe('Delete Donut? This cannot be undone.');
  await expect(logRow(page, 'Donut')).toBeVisible();

  void onNextDialog(page, 'accept');
  const request = nextApiRequest(page, '/api/food', 'DELETE');
  await logRow(page, 'Donut').getByRole('button', {name: 'Delete Donut'}).click();
  expect((await (await request).response())?.status()).toBe(204);

  await expect(logRow(page, 'Donut')).toHaveCount(0);
  await expect(page.getByText('150 calories')).toBeVisible();
  expect(await db.foodLog.count({where: {userId: user.id}})).toBe(1);
});

test('FL-07 health alert badges open the alert', async ({authedPage: page, db, user}) => {
  await seedFood(db, user.id, {
    name: 'Fried chicken',
    healthAlertLevel: 'avoid',
    healthAlertMessage: 'Very high in saturated fat.',
  });
  await seedFood(db, user.id, {
    name: 'Ramen',
    healthAlertLevel: 'caution',
    healthAlertMessage: 'High in sodium.',
  });
  await seedFood(db, user.id, {name: 'Plain rice'});
  await page.goto('/logs');

  await expect(
    logRow(page, 'Plain rice').getByRole('button', {name: /Show health alert/}),
  ).toHaveCount(0);

  await page.getByRole('button', {name: 'Show health alert for Fried chicken'}).click();
  let alert = dialog(page, 'Health alert');
  await expect(alert).toContainText('Best avoided');
  await expect(alert).toContainText('Fried chicken');
  await expect(alert).toContainText('Very high in saturated fat.');
  await expect(alert).toContainText('Raised by the AI estimate based on your health notes.');
  await alert.getByRole('button', {name: 'Close'}).click();

  await page.getByRole('button', {name: 'Show health alert for Ramen'}).click();
  alert = dialog(page, 'Health alert');
  await expect(alert).toContainText('Eat with caution');
  await expect(alert).toContainText('High in sodium.');
});
