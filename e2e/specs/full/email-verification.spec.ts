import type {Page} from '@playwright/test';
import {test, expect} from '../../fixtures/test';
import {DEFAULT_PASSWORD, uniqueEmail} from '../../fixtures/db';

// The full server has Resend configured (pointed at the mock), so sign-up
// sends a verification email and unverified users can't sign in.

async function signInWith(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', {name: 'Sign in'}).click();
}

test('register → email → verify → sign in', async ({page, mock, db, baseURL}) => {
  const email = uniqueEmail('verify');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', {exact: true}).fill(DEFAULT_PASSWORD);
  await page.getByLabel('Confirm password').fill(DEFAULT_PASSWORD);
  await page.getByRole('button', {name: 'Sign up'}).click();
  await expect(page).toHaveURL('/login');

  await expect.poll(async () => (await mock.emails(email)).length).toBe(1);
  const [sent] = await mock.emails(email);
  expect(sent.from).toBe('noreply@e2e.test');
  expect(sent.subject).toBe('Verify your Clear Calorie account');
  expect(sent.html).toContain('This link expires in 24 hours.');
  const link = /href="([^"]+)"/.exec(sent.html)?.[1];
  expect(link).toMatch(new RegExp(`^${baseURL}/verify-email\\?token=[\\w-]{32}$`));

  const token = new URL(link!).searchParams.get('token')!;
  const stored = await db.verificationToken.findUnique({where: {token}});
  expect(stored?.identifier).toBe(email);
  const expiresIn = stored!.expires.getTime() - Date.now();
  expect(expiresIn).toBeGreaterThan(23.9 * 60 * 60 * 1000);
  expect(expiresIn).toBeLessThanOrEqual(24 * 60 * 60 * 1000);

  // LOG-12: not verified yet.
  await signInWith(page, email, DEFAULT_PASSWORD);
  await expect(page.getByText('Please verify your email before signing in.')).toBeVisible();
  await expect(page).toHaveURL('/login');

  await page.goto(link!);
  await expect(page.getByText('Your email has been verified.')).toBeVisible();

  await signInWith(page, email, DEFAULT_PASSWORD);
  await expect(page).toHaveURL('/dashboard');
});

test('LOG-12 unverified accounts are told to verify; wrong passwords are not', async ({
  page,
  makeUser,
}) => {
  const unverified = await makeUser({verified: false});
  await signInWith(page, unverified.email, unverified.password);
  await expect(page.getByText('Please verify your email before signing in.')).toBeVisible();

  // The verification hint never leaks for a wrong password.
  await signInWith(page, unverified.email, 'WrongPass1!');
  await expect(page.getByText('Invalid email or password')).toBeVisible();

  const verified = await makeUser();
  await signInWith(page, verified.email, verified.password);
  await expect(page).toHaveURL('/dashboard');
});
