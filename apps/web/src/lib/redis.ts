import Redis from 'ioredis';

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

export const redisClient = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1
});

redisClient.on('error', () => {
  // Callers handle command failures and fail closed where appropriate.
});
