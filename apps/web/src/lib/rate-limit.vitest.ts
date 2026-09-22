import { afterEach, describe, expect, it, vi } from 'vitest';

const { incr, pexpire, del } = vi.hoisted(() => ({
  incr: vi.fn(),
  pexpire: vi.fn(),
  del: vi.fn()
}));

vi.mock('./redis', () => ({
  redisClient: { incr, pexpire, del }
}));

import { clearRateLimitForTests, enforceRateLimit } from './rate-limit';

describe('Redis-backed rate limit', () => {
  afterEach(async () => {
    await clearRateLimitForTests();
    vi.clearAllMocks();
  });

  it('uses an atomic Redis counter and applies the window on its first hit', async () => {
    incr.mockResolvedValue(1);
    pexpire.mockResolvedValue(1);

    await expect(enforceRateLimit('auth:test@example.com:127.0.0.1', 2)).resolves.toBe(true);

    expect(incr).toHaveBeenCalledWith('the-stand:rate-limit:9f9ec1fec30d1b23fe24654e4cb1d73456b5eb4f0744625c033d6595c3642d95');
    expect(pexpire).toHaveBeenCalledWith('the-stand:rate-limit:9f9ec1fec30d1b23fe24654e4cb1d73456b5eb4f0744625c033d6595c3642d95', 600000);
  });

  it('blocks a Redis counter at the configured maximum', async () => {
    incr.mockResolvedValue(3);

    await expect(enforceRateLimit('auth:test@example.com:127.0.0.1', 2)).resolves.toBe(false);
    expect(pexpire).not.toHaveBeenCalled();
  });

  it('fails closed when Redis is unavailable', async () => {
    incr.mockRejectedValue(new Error('redis unavailable'));

    await expect(enforceRateLimit('auth:test@example.com:127.0.0.1', 2)).resolves.toBe(false);
  });

  it('clears keys tracked during tests without using an in-memory bucket', async () => {
    incr.mockResolvedValue(1);
    pexpire.mockResolvedValue(1);
    del.mockResolvedValue(1);

    await enforceRateLimit('auth:test@example.com:127.0.0.1', 2);
    await clearRateLimitForTests();

    expect(del).toHaveBeenCalledWith('the-stand:rate-limit:9f9ec1fec30d1b23fe24654e4cb1d73456b5eb4f0744625c033d6595c3642d95');
  });
});
