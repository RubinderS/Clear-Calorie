import {Ratelimit} from '@upstash/ratelimit';
import {Redis} from '@upstash/redis';

function getRedis() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }

  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const redis = getRedis();

const noOpRateLimit = {
  limit: async () => ({
    success: true,
    limit: 0,
    reset: 0,
    remaining: 0,
  }),
};

export const authRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      analytics: true,
      prefix: '@upstash/ratelimit/auth',
    })
  : noOpRateLimit;

export async function rateLimitByIp(
  request: Request,
  limiter: Ratelimit | typeof noOpRateLimit = authRateLimit,
) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
  const identifier = `ip:${ip}`;

  const {success, limit, reset, remaining} = await limiter.limit(identifier);

  return {
    success,
    limit,
    reset,
    remaining,
    headers: {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': reset.toString(),
    },
  };
}
