import {test, expect, onNextDialog, trackRequests} from '../../fixtures/test';
import {DEFAULT_PASSWORD, seedVerificationToken, uniqueEmail} from '../../fixtures/db';

test.describe('Registration', () => {
  async function fillForm(
    page: import('@playwright/test').Page,
    {
      name = 'Jane Doe',
      email = uniqueEmail('ui'),
      password = DEFAULT_PASSWORD,
      confirm = password,
    }: {name?: string; email?: string; password?: string; confirm?: string} = {},
  ) {
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', {exact: true}).fill(password);
    await page.getByLabel('Confirm password').fill(confirm);
    return email;
  }

  test.beforeEach(async ({page}) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', {name: 'Create account'})).toBeVisible();
  });

  test('REG-01 creates an account and goes to sign in', async ({page, db}) => {
    const email = await fillForm(page, {name: 'Jane Doe'});

    const [request] = await Promise.all([
      page.waitForRequest('**/api/register'),
      page.getByRole('button', {name: 'Sign up'}).click(),
    ]);
    expect(request.postDataJSON()).toEqual({
      name: 'Jane Doe',
      email,
      password: DEFAULT_PASSWORD,
      confirmPassword: DEFAULT_PASSWORD,
    });
    const response = await request.response();
    expect(response?.status()).toBe(201);

    await expect(page).toHaveURL('/login');
    expect(await db.user.count({where: {email}})).toBe(1);
  });

  test('REG-02 mismatched passwords are caught before any request', async ({page}) => {
    const calls = trackRequests(page, '/api/register');
    await fillForm(page, {confirm: 'Different1!'});
    await page.getByRole('button', {name: 'Sign up'}).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('REG-03 browser validation blocks incomplete forms', async ({page}) => {
    const calls = trackRequests(page, '/api/register');
    await page.getByRole('button', {name: 'Sign up'}).click();
    await expect(page.getByLabel('Email')).toHaveJSProperty('validity.valueMissing', true);

    await fillForm(page, {password: 'Ab1!', confirm: 'Ab1!'});
    await page.getByRole('button', {name: 'Sign up'}).click();
    await expect(page.getByLabel('Password', {exact: true})).toHaveJSProperty(
      'validity.tooShort',
      true,
    );
    expect(calls).toEqual([]);
  });

  test('REG-04 weak password shows the server rule', async ({page}) => {
    await fillForm(page, {password: 'password123'});
    await page.getByRole('button', {name: 'Sign up'}).click();
    await expect(
      page.getByText(
        'Password must include uppercase, lowercase, number, and special character.',
      ),
    ).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('REG-05 existing email (any case) is rejected', async ({page, user}) => {
    await fillForm(page, {email: user.email.toUpperCase()});
    await page.getByRole('button', {name: 'Sign up'}).click();
    await expect(page.getByText('An account with this email already exists.')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Sign up'})).toBeEnabled();
  });

  test('REG-06 button shows progress while submitting', async ({page}) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/register', async (route) => {
      await held;
      await route.continue();
    });

    await fillForm(page);
    await page.getByRole('button', {name: 'Sign up'}).click();
    const busy = page.getByRole('button', {name: 'Creating account...'});
    await expect(busy).toBeDisabled();
    release();
    await expect(page).toHaveURL('/login');
  });

  test('REG-07 server failure message is shown', async ({page}) => {
    await page.route('**/api/register', (route) =>
      route.fulfill({
        status: 500,
        json: {error: 'Something went wrong. Please try again later.'},
      }),
    );
    await fillForm(page);
    await page.getByRole('button', {name: 'Sign up'}).click();
    await expect(page.getByText('Something went wrong. Please try again later.')).toBeVisible();
  });

  test('REG-07b link to sign in', async ({page}) => {
    await page.getByRole('link', {name: 'Sign in'}).click();
    await expect(page).toHaveURL('/login');
  });
});

test('REG-09 signed-in users can still open /register', async ({authedPage: page}) => {
  // FINDING: unlike /login, /register doesn't redirect signed-in users.
  await page.goto('/register');
  await expect(page).toHaveURL('/register');
  await expect(page.getByRole('heading', {name: 'Create account'})).toBeVisible();
});

test.describe('Sign in', () => {
  async function signInWith(
    page: import('@playwright/test').Page,
    email: string,
    password: string,
  ) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', {name: 'Sign in'}).click();
  }

  test('LOG-01 valid credentials open the dashboard', async ({page, user, baseURL}) => {
    await signInWith(page, user.email, user.password);
    await expect(page).toHaveURL('/dashboard');

    const cookies = await page.context().cookies(baseURL);
    const session = cookies.find((c) => c.name === 'next-auth.session-token');
    expect(session).toBeDefined();
    expect(session!.httpOnly).toBe(true);
    // Plain-HTTP origin: the cookie must not be Secure or the browser drops it.
    expect(session!.secure).toBe(false);
  });

  test('LOG-02 wrong password and unknown email share one message', async ({
    page,
    user,
  }) => {
    await signInWith(page, user.email, 'WrongPass1!');
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', {name: 'Sign in'})).toBeEnabled();

    await signInWith(page, uniqueEmail('nobody'), 'WrongPass1!');
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('LOG-03 email is case-insensitive', async ({page, user}) => {
    await signInWith(page, user.email.toUpperCase(), user.password);
    await expect(page).toHaveURL('/dashboard');
  });

  test('LOG-04 overly long password is rejected', async ({page, user}) => {
    await signInWith(page, user.email, `${user.password}${'x'.repeat(130)}`);
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('LOG-05 button shows progress while signing in', async ({page, user}) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/auth/callback/credentials*', async (route) => {
      await held;
      await route.continue();
    });
    await signInWith(page, user.email, user.password);
    await expect(page.getByRole('button', {name: 'Signing in...'})).toBeDisabled();
    release();
    await expect(page).toHaveURL('/dashboard');
  });

  test('LOG-06 signed-in users skip the login page', async ({authedPage: page}) => {
    await page.goto('/login');
    await expect(page).toHaveURL('/dashboard');
  });

  test('LOG-07 link to sign up', async ({page}) => {
    await page.goto('/login');
    await page.getByRole('link', {name: 'Sign up'}).click();
    await expect(page).toHaveURL('/register');
  });
});

test('LOG-07 protected pages require sign in', async ({page}) => {
  for (const path of ['/dashboard', '/logs', '/logs?tab=weight', '/food-goal', '/exercise-plan']) {
    await page.goto(path);
    await expect(page, path).toHaveURL('/login');
  }
});

test.describe('Sign out', () => {
  test('LOG-09 confirming signs out and locks pages again', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard');
    const message = onNextDialog(page, 'accept');
    await page.getByRole('button', {name: 'Sign out'}).click();
    expect(await message).toBe('Are you sure you want to sign out?');

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', {name: 'Get started'})).toBeVisible();
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('LOG-09 dismissing keeps the session', async ({authedPage: page}) => {
    await page.goto('/dashboard');
    void onNextDialog(page, 'dismiss');
    await page.getByRole('button', {name: 'Sign out'}).click();
    await page.goto('/logs');
    await expect(page).toHaveURL('/logs');
  });
});

test('LOG-10 forged session cookie redirects to login', async ({page, baseURL}) => {
  await page.context().addCookies([
    {name: 'next-auth.session-token', value: 'forged', url: baseURL!},
  ]);
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/login');
});

test.describe('Email verification page', () => {
  test('VER-01 missing token', async ({page}) => {
    await page.goto('/verify-email');
    await expect(page.getByText('Verification failed')).toBeVisible();
    await expect(page.getByText('No verification token provided.')).toBeVisible();
    await page.getByRole('link', {name: 'Back to sign in'}).click();
    await expect(page).toHaveURL('/login');
  });

  test('VER-02 valid token verifies the account', async ({page, db, makeUser}) => {
    const user = await makeUser({verified: false});
    const token = await seedVerificationToken(db, user.email);

    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByText('Your email has been verified.')).toBeVisible();
    expect((await db.user.findUnique({where: {id: user.id}}))?.emailVerified).toBeInstanceOf(
      Date,
    );
    expect(await db.verificationToken.count({where: {token}})).toBe(0);

    await page.getByRole('link', {name: 'Sign in'}).click();
    await expect(page).toHaveURL('/login');
  });

  test('VER-03/05 unknown or reused token', async ({page, db, makeUser}) => {
    await page.goto('/verify-email?token=unknown');
    await expect(page.getByText('Invalid or expired token')).toBeVisible();

    const user = await makeUser({verified: false});
    const token = await seedVerificationToken(db, user.email);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByText('Your email has been verified.')).toBeVisible();
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByText('Invalid or expired token')).toBeVisible();
  });

  test('VER-04 expired token', async ({page, db, makeUser}) => {
    const user = await makeUser({verified: false});
    const token = await seedVerificationToken(db, user.email, {
      expires: new Date(Date.now() - 1000),
    });
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByText('Verification failed')).toBeVisible();
    await expect(page.getByText('Invalid or expired token')).toBeVisible();
  });

  test('VER-07 network failure', async ({page}) => {
    await page.route('**/api/verify-email*', (route) => route.abort());
    await page.goto('/verify-email?token=abc');
    await expect(
      page.getByText('Unable to verify email. Please try again later.'),
    ).toBeVisible();
  });
});
