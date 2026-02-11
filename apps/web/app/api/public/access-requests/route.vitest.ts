import { beforeEach, describe, expect, it, vi } from 'vitest';

const { poolQuery, enforceRateLimit } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  enforceRateLimit: vi.fn()
}));

vi.mock('@/src/db/client', () => ({
  pool: {
    query: poolQuery
  }
}));

vi.mock('@/src/lib/rate-limit', () => ({
  enforceRateLimit
}));

import { POST } from './route';

describe('POST /api/public/access-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimit.mockReturnValue(true);
  });

  it('creates an access request', async () => {
    poolQuery.mockResolvedValue({ rowCount: 1 });

    const response = await POST(
      new Request('http://localhost/api/public/access-requests', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '127.0.0.1'
        },
        body: JSON.stringify({
          name: 'Test User',
          email: 'TeSt@example.com',
          stake: 'Example Stake',
          ward: 'Example Ward',
          message: 'Please grant access',
          website: ''
        })
      })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true });
    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO access_request'),
      ['Test User', 'test@example.com', 'Example Stake', 'Example Ward', 'Please grant access']
    );
  });

  it('accepts honeypot submissions but does not store', async () => {
    const response = await POST(
      new Request('http://localhost/api/public/access-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Spam User',
          email: 'spam@example.com',
          stake: 'Spam Stake',
          ward: 'Spam Ward',
          message: 'spam',
          website: 'https://spam.example.com'
        })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    enforceRateLimit.mockReturnValue(false);

    const response = await POST(
      new Request('http://localhost/api/public/access-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          stake: 'Stake',
          ward: 'Ward',
          message: 'request'
        })
      })
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Too many requests', code: 'RATE_LIMITED' });
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
