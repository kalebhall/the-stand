import Redis from 'ioredis';
import { parseRedisConnectionUrl } from './redis-url';

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

const redisUrl = process.env.REDIS_URL?.trim() || DEFAULT_REDIS_URL;

export const redisClient = new Redis({
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  ...parseRedisConnectionUrl(redisUrl)
});

redisClient.on('error', () => {
  // Callers handle command failures and fail closed where appropriate.
});
