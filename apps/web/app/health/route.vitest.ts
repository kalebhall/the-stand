import { beforeEach, describe, expect, it, vi } from 'vitest';

const { poolQuery } = vi.hoisted(() => ({
  poolQuery: vi.fn()
}));

vi.mock('@/src/db/client', () => ({
  pool: {
    query: poolQuery
  }
}));

import { GET } from './route';

describe('GET /health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
  });

  it('returns status ok payload with db connectivity', async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ status: 'ok', db: 'connected' });
    expect(poolQuery).toHaveBeenCalledWith('SELECT 1');
  });
});
