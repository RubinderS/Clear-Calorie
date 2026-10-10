import {defineConfig, devices, type PlaywrightTestConfig} from '@playwright/test';
import {
  EXTERNAL_ENABLED,
  MOCK_URL,
  serverEnv,
  serverUrl,
  type ServerName,
} from './e2e/env';
import type {TestOptions} from './e2e/fixtures/test';

// Runs against the production build: `npm run test:e2e` builds first.
// Every server gets its env set explicitly, so the real services configured
// in .env / .env.local are never used.

function appServer(name: ServerName) {
  return {
    name,
    command: `npx tsx e2e/scripts/prepare-db.ts ${name} && npx next start -p ${new URL(serverUrl(name)).port}`,
    url: `${serverUrl(name)}/login`,
    env: serverEnv(name),
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore' as const,
    stderr: 'pipe' as const,
  };
}

const desktop = devices['Desktop Chrome'];

const projects: PlaywrightTestConfig<TestOptions>['projects'] = [
  {
    name: 'api',
    testMatch: 'specs/api/**/*.spec.ts',
    use: {baseURL: serverUrl('app'), server: 'app'},
  },
  {
    name: 'chromium',
    testMatch: 'specs/app/**/*.spec.ts',
    grepInvert: /@mobile/,
    use: {...desktop, baseURL: serverUrl('app'), server: 'app'},
  },
  {
    name: 'mobile',
    testMatch: 'specs/app/**/*.spec.ts',
    grep: /@mobile/,
    use: {...devices['Pixel 7'], baseURL: serverUrl('app'), server: 'app'},
  },
  {
    // AI estimates and email verification, backed by the mock server.
    name: 'full',
    testMatch: 'specs/full/**/*.spec.ts',
    use: {...desktop, baseURL: serverUrl('full'), server: 'full'},
  },
];

if (EXTERNAL_ENABLED) {
  projects.push({
    name: 'external',
    testMatch: 'specs/external/**/*.spec.ts',
    use: {baseURL: serverUrl('external'), server: 'external'},
  });
}

export default defineConfig<TestOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // SQLite allows one writer at a time; more workers only add lock waits.
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI
    ? [['github'], ['html', {open: 'never'}]]
    : [['list'], ['html', {open: 'never'}]],
  expect: {timeout: 10_000},
  use: {
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {args: ['--autoplay-policy=no-user-gesture-required']},
  },
  projects,
  webServer: [
    {
      name: 'mock',
      command: 'npx tsx e2e/mocks/ai-server.ts',
      url: `${MOCK_URL}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    appServer('app'),
    appServer('full'),
    ...(EXTERNAL_ENABLED ? [appServer('external')] : []),
  ],
});
