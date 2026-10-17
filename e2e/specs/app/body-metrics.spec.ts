import type {Page} from '@playwright/test';
import {test, expect, nextApiRequest, onNextDialog} from '../../fixtures/test';
import {seedBodyMetric, seedBodyMetricLog} from '../../fixtures/db';
import {noonDaysAgo} from '../../fixtures/dates';
import {card, dialog, openQuickLog} from '../../fixtures/ui';

/** Opens the body measurements dialog from the Body tab. */
async function openManager(page: Page) {
  await page.getByRole('button', {name: 'Add measurement', exact: true}).click();
  const manager = dialog(page, 'Body measurements');
  await manager.waitFor();
  return manager;
}

test.describe('Body metrics', () => {
  test('BM-01 track, log, archive, restore and delete a measurement', async ({
    authedPage: page,
    db,
    user,
  }) => {
    // Only the button shows until it's pressed.
    await page.goto('/logs?tab=body');
    await expect(page.getByText('Add your own')).toHaveCount(0);

    // Enable waist in inches.
    let manager = await openManager(page);
    await manager.getByLabel('Waist unit').selectOption('in');
    await manager.getByRole('button', {name: 'Track Waist'}).click();
    await expect(manager.getByRole('button', {name: 'Archive Waist'})).toBeVisible();
    await expect(card(page, 'Waist (in)')).toContainText('No entries yet');

    // Log it from the dashboard without a weight.
    await page.goto('/dashboard');
    const panel = await openQuickLog(page, 'body');
    await expect(panel.getByRole('heading', {name: 'Log measurements'})).toBeVisible();
    await panel.getByLabel('Waist (in)').fill('33.5');
    const request = nextApiRequest(page, '/api/body-metrics/log');
    await panel.getByRole('button', {name: 'Save'}).click();
    const sent = await request;
    expect((await sent.response())?.status()).toBe(201);
    await expect(panel).toBeHidden();
    expect(await db.weightLog.count({where: {userId: user.id}})).toBe(0);

    await page.goto('/logs?tab=body');
    await expect(card(page, 'Waist (in)').getByRole('listitem')).toHaveText([/33\.5 in/]);

    // Archive: gone from the page and the form, history kept.
    manager = await openManager(page);
    await manager.getByRole('button', {name: 'Archive Waist'}).click();
    await expect(card(page, 'Waist (in)')).toHaveCount(0);
    await expect(manager.getByText('Archived (1)')).toBeVisible();
    await page.goto('/dashboard');
    const plain = await openQuickLog(page, 'body');
    await expect(plain.getByLabel('Waist (in)')).toHaveCount(0);
    await expect(plain.getByRole('button', {name: 'Log weight'})).toBeVisible();

    // Restore from the archived list brings the entry back.
    await page.goto('/logs?tab=body');
    manager = await openManager(page);
    await manager.getByText('Archived (1)').click();
    await manager.getByRole('button', {name: 'Restore Waist'}).click();
    await expect(card(page, 'Waist (in)').getByRole('listitem')).toHaveText([/33\.5 in/]);

    // Delete permanently needs archiving first and a confirmation.
    await manager.getByRole('button', {name: 'Archive Waist'}).click();
    await manager.getByText('Archived (1)').click();
    const message = onNextDialog(page, 'accept');
    await manager.getByRole('button', {name: 'Delete Waist permanently'}).click();
    expect(await message).toContain('Delete Waist and its 1 entry?');
    await expect(manager.getByText(/Archived/)).toHaveCount(0);
    expect(await db.bodyMetric.count({where: {userId: user.id}})).toBe(0);
  });

  test('BM-02 custom metric, and re-adding an archived name offers restore', async ({
    authedPage: page,
    db,
    user,
  }) => {
    const bicep = await seedBodyMetric(db, user.id, {
      key: null,
      label: 'Bicep',
      unit: 'cm',
      direction: 'up',
      archivedAt: new Date(),
    });
    await seedBodyMetricLog(db, bicep.id, {value: 36, loggedAt: noonDaysAgo(3)});

    await page.goto('/logs?tab=body');
    const manager = await openManager(page);
    await manager.getByLabel('Name', {exact: true}).fill('Neck');
    await manager.getByLabel('Unit', {exact: true}).fill('cm');
    await manager.getByRole('button', {name: 'Add custom measurement'}).click();
    await expect(manager.getByRole('button', {name: 'Archive Neck'})).toBeVisible();

    await manager.getByLabel('Name', {exact: true}).fill('bicep');
    await manager.getByLabel('Unit', {exact: true}).fill('cm');
    await manager.getByRole('button', {name: 'Add custom measurement'}).click();
    const offer = manager.getByRole('alert');
    await expect(offer).toContainText('You archived Bicep before');
    await offer.getByRole('button', {name: 'Restore'}).click();
    await expect(card(page, 'Bicep (cm)').getByRole('listitem')).toHaveText([/36 cm/]);
  });

  test('BM-03 form needs at least one value and checks preset ranges', async ({
    authedPage: page,
    db,
    user,
  }) => {
    await seedBodyMetric(db, user.id, {key: 'body_fat', label: 'Body fat', unit: '%'});
    await page.goto('/dashboard');
    const panel = await openQuickLog(page, 'body');

    await panel.getByRole('button', {name: 'Save'}).click();
    await expect(panel.getByRole('alert')).toHaveText('Enter at least one measurement.');

    const input = panel.getByLabel('Body fat (%)');
    await input.fill('90');
    await panel.getByRole('button', {name: 'Save'}).click();
    await expect(input).toHaveJSProperty('validity.rangeOverflow', true);
  });

  test('BM-04 the quick-log link opens the dialog, and closing tidies the URL', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard');
    const panel = await openQuickLog(page, 'body');
    await panel.getByRole('link', {name: 'Track body fat, waist and more'}).click();
    await expect(page).toHaveURL('/logs?tab=body&manage=1');
    const manager = dialog(page, 'Body measurements');
    await expect(manager).toBeVisible();

    await manager.getByRole('button', {name: 'Close'}).click();
    await expect(manager).toBeHidden();
    await expect(page).toHaveURL('/logs?tab=body');
  });

  test('BM-05 dropdown arrows keep clear of the border', async ({authedPage: page}) => {
    await page.goto('/logs?tab=body');
    const manager = await openManager(page);
    for (const select of [
      manager.getByLabel('Waist unit'),
      manager.getByLabel('Goal', {exact: true}),
    ]) {
      const box = (await select.boundingBox())!;
      const arrow = (await select.locator('xpath=following-sibling::*[1]').boundingBox())!;
      expect(box.x + box.width - (arrow.x + arrow.width)).toBeGreaterThanOrEqual(8);
      expect(await select.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
    }

    // Unit dropdowns are one width whatever the measurement's name or units.
    const widths = await manager
      .getByRole('combobox', {name: / unit$/})
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(widths.length).toBeGreaterThan(1);
    expect(new Set(widths).size).toBe(1);
  });
});
