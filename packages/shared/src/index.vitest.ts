import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './index';

describe('healthResponseSchema', () => {
  it('validates expected payload', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      db: 'connected',
      version: '0.1.0'
    });

    expect(parsed.status).toBe('ok');
  });
});
