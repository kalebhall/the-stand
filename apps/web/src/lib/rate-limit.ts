import { createHash } from 'node:crypto';

import { redisClient } from './redis';

const WINDOW_MS = 10 * 60 * 1000;
const KEY_PREFIX = 'the-stand:rate-limit:';
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
if count > tonumber(ARGV[2]) then
  return 0
end
return 1
`;

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
    const allowed = await redisClient.eval(RATE_LIMIT_SCRIPT, 1, redisKey, WINDOW_MS, maxAttempts);
    return Number(allowed) === 1;
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
