import type {Page} from '@playwright/test';
import {test, expect} from '../../fixtures/test';
import {THEME_COLORS} from '../../../lib/theme-colors';

const isDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'));

async function chooseTheme(page: Page, label: 'Light' | 'Dark' | 'System') {
  await page.getByRole('button', {name: 'Change theme'}).click();
  await page.getByRole('menuitemradio', {name: label}).click();
}

test('TH-01 switching themes updates class, storage and browser chrome', async ({
  page,
}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await page.goto('/login');
  const toggle = page.getByRole('button', {name: 'Change theme'});
  await expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitemradio')).toHaveText(['Light', 'Dark', 'System']);
  await expect(menu.getByRole('menuitemradio', {name: 'System'})).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await menu.getByRole('menuitemradio', {name: 'Dark'}).click();
  await expect(menu).toBeHidden();
  expect(await isDark(page)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('clearcalorie-theme'))).toBe('dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    THEME_COLORS.dark,
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  await expect(
    page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
  ).toHaveAttribute('content', 'black-translucent');

  await chooseTheme(page, 'Light');
  expect(await isDark(page)).toBe(false);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    THEME_COLORS.light,
  );
  await expect(
    page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
  ).toHaveAttribute('content', 'default');

  await toggle.click();
  await expect(page.getByRole('menuitemradio', {name: 'Light'})).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('TH-02 saved theme applies before hydration on reload', async ({authedPage: page}) => {
  await page.goto('/dashboard');
  await chooseTheme(page, 'Dark');
  await page.reload({waitUntil: 'domcontentloaded'});
  expect(await isDark(page)).toBe(true);
  await page.goto('/logs', {waitUntil: 'domcontentloaded'});
  expect(await isDark(page)).toBe(true);
});

test('TH-03 system theme follows the OS setting live', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'});
  await page.goto('/login');
  expect(await isDark(page)).toBe(true);
  await page.emulateMedia({colorScheme: 'light'});
  await expect.poll(() => isDark(page)).toBe(false);

  // An explicit choice ignores the OS.
  await chooseTheme(page, 'Light');
  await page.emulateMedia({colorScheme: 'dark'});
  await page.waitForTimeout(100);
  expect(await isDark(page)).toBe(false);
});

test('TH-04 menu closes on outside click; tabs stay in sync', async ({page, context}) => {
  await page.goto('/login');
  await page.getByRole('button', {name: 'Change theme'}).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('heading', {name: 'Sign in'}).click();
  await expect(page.getByRole('menu')).toBeHidden();

  const other = await context.newPage();
  await other.goto('/register');
  await chooseTheme(page, 'Dark');
  await expect.poll(() => isDark(other)).toBe(true);
  await other.close();
});

test('TH-05 theme toggle is available on auth pages', async ({page}) => {
  for (const path of ['/login', '/register', '/verify-email']) {
    await page.goto(path);
    await expect(page.getByRole('button', {name: 'Change theme'}), path).toBeVisible();
  }
});
