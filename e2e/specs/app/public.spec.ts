import {test, expect} from '../../fixtures/test';
import {card} from '../../fixtures/ui';

test('PUB-01 landing page for visitors', async ({page}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {level: 1, name: 'Track your health journey with clarity'}),
  ).toBeVisible();
  await expect(page.getByText('Your personal health companion')).toBeVisible();

  // Sample data preview: 1700 eaten - 250 burned = 1450 net of 2000.
  const preview = card(page, "Today's progress");
  await expect(preview.getByText('550', {exact: true})).toBeVisible();
  await expect(preview.getByText('remaining', {exact: true})).toBeVisible();
  await expect(preview.getByText('1450 / 2000')).toBeVisible();
  await expect(preview.getByText('2/3')).toBeVisible();
  await expect(preview.getByText('58', {exact: true})).toBeVisible(); // 150 - 92 protein

  await page.getByRole('link', {name: 'Get started'}).click();
  await expect(page).toHaveURL('/register');

  await page.goto('/');
  await page.getByRole('link', {name: 'Sign in'}).click();
  await expect(page).toHaveURL('/login');
});

test('PUB-02 signed-in visitors go straight to the dashboard', async ({
  authedPage: page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL('/dashboard');
});

test('PUB-03 document metadata', async ({page}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Clear Calorie — Calorie & Health Tracking');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Track calories, exercise, weight, and health goals.',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    'Clear Calorie',
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
});

test('PUB-06 legacy log URLs end at login when signed out', async ({page}) => {
  await page.goto('/food');
  await expect(page).toHaveURL('/login');
});

test('PUB-06 legacy log URLs open the matching tab', async ({authedPage: page}) => {
  await page.goto('/weight');
  await expect(page).toHaveURL('/logs?tab=weight');
  await expect(page.getByRole('link', {name: 'Weight'})).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('PUB-07 unknown routes show the 404 page', async ({page}) => {
  const response = await page.goto('/definitely-not-here');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('This page could not be found.')).toBeVisible();
});
