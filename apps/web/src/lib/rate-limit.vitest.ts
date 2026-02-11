import { afterEach, describe, expect, it } from 'vitest';

import { clearRateLimitForTests, enforceRateLimit } from './rate-limit';

describe('rate limit', () => {
  afterEach(() => {
    clearRateLimitForTests();
  });

  it('blocks requests after maximum attempts in window', () => {
    const key = 'auth:test@example.com:127.0.0.1';

    expect(enforceRateLimit(key, 2)).toBe(true);
    expect(enforceRateLimit(key, 2)).toBe(true);
    expect(enforceRateLimit(key, 2)).toBe(false);
  });
});
