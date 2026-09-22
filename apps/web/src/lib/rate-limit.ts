import { createHash } from 'node:crypto';

import { redisClient } from './redis';

const WINDOW_MS = 10 * 60 * 1000;
const KEY_PREFIX = 'the-stand:rate-limit:';

const keysUsedByTests = new Set<string>();

function getRedisKey(key: string): string {
  const digest = createHash('sha256').update(key, 'utf8').digest('hex');
  return `${KEY_PREFIX}${digest}`;
}

export async function enforceRateLimit(key: string, maxAttempts: number): Promise<boolean> {
  const redisKey = getRedisKey(key);
  if (process.env.NODE_ENV === 'test') {
    keysUsedByTests.add(redisKey);
  }

  try {
    const count = await redisClient.incr(redisKey);
    if (count === 1) {
      await redisClient.pexpire(redisKey, WINDOW_MS);
    }
    return count <= maxAttempts;
  } catch (error) {
    console.error('rate_limit_redis_error', { error });
    return false;
  }
}

export async function clearRateLimitForTests(): Promise<void> {
  if (keysUsedByTests.size === 0) return;
  await redisClient.del(...keysUsedByTests);
  keysUsedByTests.clear();
}
