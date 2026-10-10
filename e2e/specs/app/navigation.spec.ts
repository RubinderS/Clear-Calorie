import {test, expect, onNextDialog} from '../../fixtures/test';
import {openQuickLog} from '../../fixtures/ui';

// Whole-class match: inactive links still carry `hover:bg-accent`.
const ACTIVE = /(^|\s)bg-accent(\s|$)/;

const PAGES = [
  {href: '/dashboard', label: 'Dashboard'},
  {href: '/logs', label: 'Logs'},
  {href: '/food-goal', label: 'Food Goal'},
  {href: '/exercise-plan', label: 'Exercise Plan'},
];

test('NAV-01 desktop header navigation', async ({authedPage: page}) => {
  await page.goto('/dashboard');
  const nav = page.locator('header nav');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveText(PAGES.map((p) => p.label));
  await expect(page.getByRole('button', {name: 'Open menu'})).toBeHidden();

  for (const {href, label} of PAGES) {
    await nav.getByRole('link', {name: label}).click();
    await expect(page).toHaveURL(href);
    await expect(page.getByRole('heading', {level: 1, name: label})).toBeVisible();
    await expect(nav.getByRole('link', {name: label})).toHaveClass(ACTIVE);
    for (const other of PAGES.filter((p) => p.href !== href)) {
      await expect(nav.getByRole('link', {name: other.label})).not.toHaveClass(ACTIVE);
    }
  }

  await page.locator('header').getByRole('link', {name: /Clear Calorie/}).click();
  await expect(page).toHaveURL('/dashboard');
});

test.describe('Mobile @mobile', () => {
  test('NAV-02 page title and menu', async ({authedPage: page}) => {
    await page.goto('/food-goal');
    const header = page.locator('header');
    await expect(header.locator('nav')).toBeHidden();
    await expect(page.getByRole('heading', {level: 1})).toBeHidden();
    // The desktop link with the same text is hidden, so look at visible text only.
    await expect(header.getByText('Food Goal', {exact: true}).filter({visible: true})).toHaveCount(1);

    const toggle = page.getByRole('button', {name: 'Open menu'});
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();

    const menu = page.locator('#mobile-nav');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Menu')).toBeVisible();
    await expect(menu.getByRole('link')).toHaveText(PAGES.map((p) => p.label));
    await expect(menu.getByRole('link', {name: 'Food Goal'})).toHaveClass(ACTIVE);
    await expect(menu.getByRole('button', {name: 'Sign out'})).toBeVisible();

    await menu.getByRole('button', {name: 'Close menu'}).click();
    await expect(menu).toBeHidden();

    // Navigating closes the menu.
    await page.getByRole('button', {name: 'Open menu'}).click();
    await menu.getByRole('link', {name: 'Logs'}).click();
    await expect(page).toHaveURL('/logs');
    await expect(menu).toBeHidden();
    await expect(header.getByText('Logs', {exact: true}).filter({visible: true})).toHaveCount(1);

    // Growing to desktop width closes it too.
    await page.getByRole('button', {name: 'Open menu'}).click();
    await expect(menu).toBeVisible();
    await page.setViewportSize({width: 1024, height: 800});
    await expect(menu).toBeHidden();
  });

  test('NAV-03 sign out from the menu', async ({authedPage: page}) => {
    await page.goto('/dashboard');
    await page.getByRole('button', {name: 'Open menu'}).click();
    const message = onNextDialog(page, 'accept');
    await page.locator('#mobile-nav').getByRole('button', {name: 'Sign out'}).click();
    expect(await message).toBe('Are you sure you want to sign out?');
    await expect(page).toHaveURL('/');
  });

  test.describe('NAV-04 narrow screens', () => {
    test.use({viewport: {width: 360, height: 780}});

    test('no horizontal scrolling on any page or dialog', async ({authedPage: page}) => {
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      for (const path of [
        '/dashboard',
        '/logs',
        '/logs?tab=exercise',
        '/logs?tab=weight',
        '/food-goal',
        '/exercise-plan',
      ]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await overflow(), path).toBeLessThanOrEqual(0);
      }

      await page.goto('/dashboard');
      for (const panel of ['food', 'exercise', 'weight'] as const) {
        const panelDialog = await openQuickLog(page, panel);
        const box = await panelDialog.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(360);
        expect(
          await panelDialog.evaluate((el) => el.scrollWidth - el.clientWidth),
          panel,
        ).toBeLessThanOrEqual(0);
        await page.keyboard.press('Escape');
      }
    });
  });
});
