import {expect, type APIRequestContext} from '@playwright/test';

/**
 * Signs in through the NextAuth credentials endpoint, the same call the login
 * form makes. Cookies land in the request context's jar, which a browser
 * context's `request` shares with its pages.
 */
export async function signIn(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const csrf = await request.get('/api/auth/csrf');
  const {csrfToken} = (await csrf.json()) as {csrfToken: string};

  const response = await request.post('/api/auth/callback/credentials', {
    form: {csrfToken, email, password, json: 'true'},
  });
  const body = (await response.json()) as {url?: string};
  return {ok: response.ok() && !body.url?.includes('error='), url: body.url};
}

export async function signInOrThrow(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const result = await signIn(request, email, password);
  expect(result.ok, `sign in as ${email}: ${result.url}`).toBe(true);
  const session = await (await request.get('/api/auth/session')).json();
  expect(session?.user?.email).toBe(email);
}
