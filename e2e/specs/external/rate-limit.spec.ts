import {randomInt} from 'node:crypto';
import {test, expect} from '../../fixtures/test';

// Runs only when E2E_UPSTASH_REDIS_REST_URL and E2E_UPSTASH_REDIS_REST_TOKEN
// point at a test-only Upstash database (see playwright.config.ts).

// A documentation-range address per test keeps runs from sharing a window.
const randomIp = () => `203.0.113.${randomInt(1, 255)}, 10.0.0.${randomInt(1, 255)}`;

function attempt(request: import('@playwright/test').APIRequestContext, ip: string) {
  return request.post('/api/register', {
    headers: {'x-forwarded-for': ip},
    data: {email: 'not-an-email', password: 'x', confirmPassword: 'x'},
  });
}

test('RL-01 sign-up is limited to 5 attempts per 15 minutes per IP', async ({request}) => {
  const ip = randomIp();
  for (let i = 0; i < 5; i++) {
    const response = await attempt(request, ip);
    expect(response.status(), `attempt ${i + 1}`).toBe(400);
    expect(response.headers()['x-ratelimit-limit']).toBe('5');
  }
  const blocked = await attempt(request, ip);
  expect(blocked.status()).toBe(429);
  expect(await blocked.json()).toEqual({error: 'Too many attempts. Please try again later.'});
  expect(blocked.headers()['x-ratelimit-remaining']).toBe('0');
  expect(Number(blocked.headers()['x-ratelimit-reset'])).toBeGreaterThan(Date.now());
});

test('RL-02 AI estimates are limited to 20 per 10 minutes per user', async ({api}) => {
  for (let i = 0; i < 20; i++) {
    const response = await api.post('/api/food/estimate', {data: {description: `egg ${i}`}});
    expect(response.status(), `request ${i + 1}`).toBe(200);
  }
  const blocked = await api.post('/api/food/estimate', {data: {description: 'egg'}});
  expect(blocked.status()).toBe(429);
  expect(await blocked.json()).toEqual({
    error: 'Too many AI requests. Please try again later.',
  });
});

test('RL-03 a spoofed x-forwarded-for gets a fresh limit', async ({request}) => {
  // FINDING: the limit is keyed on a client-supplied header, so without a
  // proxy that overwrites it, changing the header bypasses the limit.
  const ip = randomIp();
  for (let i = 0; i < 6; i++) await attempt(request, ip);
  expect((await attempt(request, ip)).status()).toBe(429);
  expect((await attempt(request, randomIp())).status()).toBe(400);
});
