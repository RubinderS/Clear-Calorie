import {test, expect} from '../../fixtures/test';
import {seedVerificationToken} from '../../fixtures/db';

test('PUB-04 web app manifest', async ({request}) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'Clear Calorie',
    short_name: 'Clear Calorie',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
  });
  expect(manifest.icons).toHaveLength(5);
  expect(manifest.icons.map((icon: {src: string}) => icon.src)).toEqual([
    '/icon',
    '/icon-192',
    '/icon-192',
    '/icon-512',
    '/icon-512',
  ]);
});

for (const path of ['/icon', '/icon-192', '/icon-512', '/apple-icon']) {
  test(`PUB-05 ${path} is a PNG`, async ({request}) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const body = await response.body();
    // PNG signature
    expect([...body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
}

for (const tab of ['food', 'exercise', 'weight']) {
  test(`PUB-06 /${tab} redirects to the logs tab`, async ({request}) => {
    const response = await request.get(`/${tab}`, {maxRedirects: 0});
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(`/logs?tab=${tab}`);
  });
}

test('LOG-08 session endpoint', async ({request, api, user}) => {
  expect(await (await request.get('/api/auth/session')).json()).toEqual({});

  const session = await (await api.get('/api/auth/session')).json();
  expect(session.user).toMatchObject({id: user.id, email: user.email});
  expect(session.expires).toEqual(expect.any(String));
});

test('LOG-11 auth error page is the login page', async ({request}) => {
  const response = await request.get('/api/auth/error?error=Configuration', {
    maxRedirects: 0,
  });
  expect([302, 307]).toContain(response.status());
  expect(response.headers().location).toContain('/login?error=Configuration');
});

test('LOG-10 forged session cookie is rejected', async ({playwright, baseURL}) => {
  const forged = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: {Cookie: 'next-auth.session-token=forged.token.value'},
  });
  const response = await forged.get('/api/exercise-goals');
  expect(response.status()).toBe(401);
  const page = await forged.get('/dashboard', {maxRedirects: 0});
  expect([302, 307]).toContain(page.status());
  expect(page.headers().location).toContain('/login');
  await forged.dispose();
});

test.describe('VER-06 verify-email API', () => {
  test('missing token → 400', async ({request}) => {
    const response = await request.get('/api/verify-email');
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({error: 'Invalid token'});
  });

  test('unknown token → 400', async ({request}) => {
    const response = await request.get('/api/verify-email?token=nope');
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({error: 'Invalid or expired token'});
  });

  test('valid token verifies once and redirects to login', async ({
    request,
    db,
    makeUser,
  }) => {
    const user = await makeUser({verified: false});
    const token = await seedVerificationToken(db, user.email);

    const response = await request.get(`/api/verify-email?token=${token}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location).pathname).toBe('/login');
    expect(new URL(response.headers().location).search).toBe('?verified=1');

    const stored = await db.user.findUnique({where: {id: user.id}});
    expect(stored?.emailVerified).toBeInstanceOf(Date);
    expect(await db.verificationToken.count({where: {token}})).toBe(0);

    const reuse = await request.get(`/api/verify-email?token=${token}`);
    expect(reuse.status()).toBe(400);
  });

  test('expired token → 400 and user stays unverified', async ({
    request,
    db,
    makeUser,
  }) => {
    const user = await makeUser({verified: false});
    const token = await seedVerificationToken(db, user.email, {
      expires: new Date(Date.now() - 60_000),
    });
    const response = await request.get(`/api/verify-email?token=${token}`);
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({error: 'Invalid or expired token'});
    expect((await db.user.findUnique({where: {id: user.id}}))?.emailVerified).toBeNull();
  });
});
