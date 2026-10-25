import path from 'node:path';

// Shared by playwright.config.ts, the servers it starts and the test fixtures.

export const ROOT = path.resolve(__dirname, '..');

export const MOCK_PORT = 3199;
/** The in-memory MongoDB that e2e/scripts/mongo-server.ts runs for every app server. */
export const MONGO_PORT = 3198;
export const MONGO_HEALTH_PORT = 3197;
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

export const NEXTAUTH_SECRET = 'e2e-only-secret-that-is-at-least-32-characters-long';
export const MOCK_AI_KEY = 'test-key';
export const MOCK_AI_MODEL = 'mock-model';

export type ServerName = 'app' | 'full' | 'external';

type ServerConfig = {
  port: number;
  /** Database on the test MongoDB; recreated on every run. */
  dbName: string;
  /** Extra env on top of the shared one; empty strings switch features off. */
  env: Record<string, string>;
};

export function dbUrl(dbName: string) {
  return `mongodb://127.0.0.1:${MONGO_PORT}/${dbName}`;
}

const NO_AI = {AI_BASE_URL: '', AI_MODEL: '', AI_API_KEY: ''};
const NO_EMAIL = {RESEND_API_KEY: '', RESEND_FROM_EMAIL: '', RESEND_BASE_URL: ''};
const NO_RATE_LIMIT = {UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: ''};

export const SERVERS: Record<ServerName, ServerConfig> = {
  // Every optional integration off: the app as self-hosted with no extras.
  app: {
    port: 3100,
    dbName: 'e2e',
    env: {...NO_AI, ...NO_EMAIL, ...NO_RATE_LIMIT},
  },
  // AI estimates and email verification on, both served by the local mock.
  full: {
    port: 3101,
    dbName: 'e2e-full',
    env: {
      AI_BASE_URL: `${MOCK_URL}/v1`,
      AI_MODEL: MOCK_AI_MODEL,
      AI_API_KEY: MOCK_AI_KEY,
      RESEND_API_KEY: 're_e2e_mock',
      RESEND_FROM_EMAIL: 'noreply@e2e.test',
      RESEND_BASE_URL: MOCK_URL,
      ...NO_RATE_LIMIT,
    },
  },
  // Opt-in: real Upstash rate limiting with test-only credentials.
  external: {
    port: 3102,
    dbName: 'e2e-external',
    env: {
      AI_BASE_URL: `${MOCK_URL}/v1`,
      AI_MODEL: MOCK_AI_MODEL,
      AI_API_KEY: MOCK_AI_KEY,
      ...NO_EMAIL,
      UPSTASH_REDIS_REST_URL: process.env.E2E_UPSTASH_REDIS_REST_URL ?? '',
      UPSTASH_REDIS_REST_TOKEN: process.env.E2E_UPSTASH_REDIS_REST_TOKEN ?? '',
    },
  },
};

export const EXTERNAL_ENABLED = Boolean(
  process.env.E2E_UPSTASH_REDIS_REST_URL &&
    process.env.E2E_UPSTASH_REDIS_REST_TOKEN,
);

export function serverUrl(name: ServerName) {
  return `http://localhost:${SERVERS[name].port}`;
}

/** Full env for a server: set explicitly so the real .env / .env.local values never apply. */
export function serverEnv(name: ServerName): Record<string, string> {
  const {dbName, env} = SERVERS[name];
  return {
    TZ: 'UTC',
    DATABASE_URL: dbUrl(dbName),
    NEXTAUTH_URL: serverUrl(name),
    NEXTAUTH_SECRET,
    // The hourly report job would call the AI mock in the background.
    WEEKLY_REPORTS: 'off',
    ...env,
  };
}
