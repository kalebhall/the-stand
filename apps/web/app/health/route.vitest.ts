import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /health', () => {
  it('returns status ok payload', async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
