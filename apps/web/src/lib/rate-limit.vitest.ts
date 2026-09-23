import { afterEach, describe, expect, it, vi } from 'vitest';

const { evalScript, del } = vi.hoisted(() => ({
  evalScript: vi.fn(),
  del: vi.fn()
}));

vi.mock('./redis', () => ({
  redisClient: { eval: evalScript, del }
}));

import { clearRateLimitForTests, enforceRateLimit } from './rate-limit';

describe('Redis-backed rate limit', () => {
  afterEach(async () => {
    await clearRateLimitForTests();
    vi.clearAllMocks();
  });

  it('uses an atomic Redis script and applies the window on its first hit', async () => {
    evalScript.mockResolvedValue(1);

    await expect(enforceRateLimit('auth:test@example.com:127.0.0.1', 2)).resolves.toBe(true);

    expect(evalScript).toHaveBeenCalledWith(
      expect.stringContaining('PEXPIRE'),
      1,
      'the-stand:rate-limit:9f9ec1fec30d1b23fe24654e4cb1d73456b5eb4f0744625c033d6595c3642d95',
      600000,
      2
    );
  });

  it('blocks a Redis counter at the configured maximum', async () => {
    evalScript.mockResolvedValue(0);

    await expect(enforceRateLimit('auth:test@example.com:127.0.0.1', 2)).resolves.toBe(false);
  });

  it('fails closed when Redis is unavailable', async () => {
    evalScript.mockRejectedValue(new Error('redis unavailable'));

    await expect(enforceRateLimit('auth:test@example.com:127.0.0.1', 2)).resolves.toBe(false);
  });

  it('clears keys tracked during tests without using an in-memory bucket', async () => {
    evalScript.mockResolvedValue(1);
    del.mockResolvedValue(1);

    await enforceRateLimit('auth:test@example.com:127.0.0.1', 2);
    await clearRateLimitForTests();

    expect(del).toHaveBeenCalledWith('the-stand:rate-limit:9f9ec1fec30d1b23fe24654e4cb1d73456b5eb4f0744625c033d6595c3642d95');
  });
});
