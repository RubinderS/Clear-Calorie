import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import type {PrismaClient} from '@prisma/client';
import {MOCK_URL, type ServerName} from '../env';
import type {RecordedEmail, RecordedRequest} from '../mocks/data';
import {signInOrThrow} from './auth';
import {createUser, getDb, type CreateUserOptions, type TestUser} from './db';

export type TestOptions = {
  /** Which app server (and so which database) the project runs against. */
  server: ServerName;
  /** Opt out of failing on uncaught page errors and hydration mismatches. */
  allowPageErrors: boolean;
};

type ApiOptions = {timeZone?: string};

type Fixtures = {
  db: PrismaClient;
  /** A fresh, verified user for this test. */
  user: TestUser;
  makeUser: (options?: CreateUserOptions) => Promise<TestUser>;
  /** `page` signed in as `user`, with the `tz` cookie already in sync. */
  authedPage: Page;
  /** API context signed in as `user`. */
  api: APIRequestContext;
  apiAs: (user: TestUser, options?: ApiOptions) => Promise<APIRequestContext>;
  mock: {
    requests: (contains: string) => Promise<RecordedRequest[]>;
    emails: (to: string) => Promise<RecordedEmail[]>;
  };
};

export const test = base.extend<TestOptions & Fixtures>({
  server: ['app', {option: true}],
  allowPageErrors: [false, {option: true}],

  page: async ({page, allowPageErrors}, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydrat/i.test(message.text())) {
        errors.push(message.text());
      }
    });
    await use(page);
    if (!allowPageErrors) {
      expect(errors, 'uncaught page errors').toEqual([]);
    }
  },

  db: async ({server}, use) => {
    await use(getDb(server));
  },

  makeUser: async ({db}, use) => {
    await use((options) => createUser(db, options));
  },

  user: async ({makeUser}, use) => {
    await use(await makeUser());
  },

  authedPage: async ({page, user, baseURL, timezoneId}, use) => {
    await page
      .context()
      .addCookies([{name: 'tz', value: timezoneId ?? 'UTC', url: baseURL!}]);
    await signInOrThrow(page.context().request, user.email, user.password);
    await use(page);
  },

  apiAs: async ({playwright, baseURL}, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (user, {timeZone = 'UTC'} = {}) => {
      const url = new URL(baseURL!);
      const context = await playwright.request.newContext({
        baseURL,
        storageState: {
          cookies: [
            {
              name: 'tz',
              value: timeZone,
              domain: url.hostname,
              path: '/',
              expires: -1,
              httpOnly: false,
              secure: false,
              sameSite: 'Lax',
            },
          ],
          origins: [],
        },
      });
      contexts.push(context);
      await signInOrThrow(context, user.email, user.password);
      return context;
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },

  api: async ({apiAs, user}, use) => {
    await use(await apiAs(user));
  },

  mock: async ({}, use) => {
    const get = async <T>(path: string): Promise<T> => {
      const response = await fetch(`${MOCK_URL}${path}`);
      return (await response.json()) as T;
    };
    await use({
      requests: (contains) =>
        get(`/__requests?contains=${encodeURIComponent(contains)}`),
      emails: (to) => get(`/__emails?to=${encodeURIComponent(to)}`),
    });
  },
});

export {expect};

/**
 * Handles the next window.confirm / alert and resolves with its message.
 * Without a handler Playwright dismisses dialogs automatically.
 */
export function onNextDialog(
  page: Page,
  action: 'accept' | 'dismiss' = 'accept',
): Promise<string> {
  return new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message();
      if (action === 'accept') await dialog.accept();
      else await dialog.dismiss();
      resolve(message);
    });
  });
}

/** Waits for the next request to an API path (optionally a method) and returns it. */
export function nextApiRequest(page: Page, path: string, method = 'POST') {
  return page.waitForRequest(
    (request) =>
      request.method() === method && new URL(request.url()).pathname === path,
  );
}

/** Waits for the next response from an API path (optionally a method). */
export function nextApiResponse(page: Page, path: string, method = 'POST') {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname === path,
  );
}

/** Collects requests to a path so a test can assert none were made. */
export function trackRequests(page: Page, path: string) {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === path) {
      seen.push(`${request.method()} ${request.url()}`);
    }
  });
  return seen;
}
