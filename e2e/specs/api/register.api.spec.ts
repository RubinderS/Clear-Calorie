import {test, expect} from '../../fixtures/test';
import {DEFAULT_PASSWORD, uniqueEmail} from '../../fixtures/db';

function registration(overrides: Record<string, unknown> = {}) {
  return {
    name: 'New Person',
    email: uniqueEmail('reg'),
    password: DEFAULT_PASSWORD,
    confirmPassword: DEFAULT_PASSWORD,
    ...overrides,
  };
}

test('REG-01 creates the user with hashed password and default goals', async ({
  request,
  db,
}) => {
  const email = uniqueEmail('reg').toUpperCase();
  const response = await request.post('/api/register', {
    data: registration({email, name: '  Jane  '}),
  });

  expect(response.status()).toBe(201);
  expect(await response.json()).toEqual({
    success: true,
    message: 'Account created. Please check your email to verify your account.',
  });

  const user = await db.user.findUnique({
    where: {email: email.toLowerCase()},
    include: {goals: true},
  });
  expect(user).not.toBeNull();
  expect(user!.name).toBe('Jane');
  expect(user!.password).not.toBe(DEFAULT_PASSWORD);
  expect(user!.password).toMatch(/^\$2[aby]\$/);
  // Verification is off on this server, so the user isn't marked verified.
  expect(user!.emailVerified).toBeNull();
  expect(user!.goals).toMatchObject({
    calorieGoal: 2000,
    proteinGoal: 150,
    carbsGoal: 250,
    fatGoal: 70,
    saturatedFatGoal: 20,
    healthNotes: null,
  });
});

test('REG-08 blank name is stored as null', async ({request, db}) => {
  const data = registration({name: '   '});
  expect((await request.post('/api/register', {data})).status()).toBe(201);
  const user = await db.user.findUnique({where: {email: data.email}});
  expect(user?.name).toBeNull();
});

test('REG-05 duplicate email is rejected regardless of case', async ({
  request,
}) => {
  const data = registration();
  expect((await request.post('/api/register', {data})).status()).toBe(201);

  for (const email of [data.email, data.email.toUpperCase()]) {
    const response = await request.post('/api/register', {
      data: {...data, email},
    });
    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({
      error: 'An account with this email already exists.',
    });
  }
});

test.describe('REG-A1 validation', () => {
  const invalid: [string, Record<string, unknown>][] = [
    ['invalid email', {email: 'not-an-email'}],
    ['short password', {password: 'Ab1!', confirmPassword: 'Ab1!'}],
    [
      'password over 128 chars',
      {password: `Aa1!${'x'.repeat(130)}`, confirmPassword: `Aa1!${'x'.repeat(130)}`},
    ],
    ['name over 100 chars', {name: 'n'.repeat(101)}],
    ['missing email', {email: undefined}],
    ['missing confirmPassword', {confirmPassword: undefined}],
  ];

  for (const [label, overrides] of invalid) {
    test(`${label} → 400`, async ({request}) => {
      const response = await request.post('/api/register', {
        data: registration(overrides),
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Invalid input. Please check your email and password.',
      });
    });
  }

  test('password mismatch → 400 with specific message', async ({request}) => {
    const response = await request.post('/api/register', {
      data: registration({confirmPassword: 'Different1!'}),
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({error: 'Passwords do not match.'});
  });

  for (const password of ['password1!', 'PASSWORD1!', 'Password!!', 'Password12']) {
    test(`REG-04 weak password "${password}" → 400`, async ({request}) => {
      const response = await request.post('/api/register', {
        data: registration({password, confirmPassword: password}),
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({
        error:
          'Password must include uppercase, lowercase, number, and special character.',
      });
    });
  }
});

test('REG-A2 responses carry rate limit headers', async ({request}) => {
  const created = await request.post('/api/register', {data: registration()});
  const rejected = await request.post('/api/register', {
    data: registration({email: 'bad'}),
  });
  for (const response of [created, rejected]) {
    const headers = response.headers();
    // The no-op limiter (no Upstash) reports zeros.
    expect(headers['x-ratelimit-limit']).toBe('0');
    expect(headers['x-ratelimit-remaining']).toBe('0');
    expect(headers['x-ratelimit-reset']).toBe('0');
  }
});

test('REG-A3 malformed JSON returns 500', async ({request}) => {
  // FINDING: a client error is reported as a server error.
  const response = await request.post('/api/register', {
    headers: {'Content-Type': 'application/json'},
    // A Buffer is sent as-is; a string would be JSON-encoded into valid JSON.
    data: Buffer.from('{not json'),
  });
  expect(response.status()).toBe(500);
  expect(await response.json()).toEqual({
    error: 'Something went wrong. Please try again later.',
  });
});
