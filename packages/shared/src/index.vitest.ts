import { describe, expect, it } from 'vitest';

import { healthResponseSchema, type HealthResponse } from './index';

describe('shared placeholders', () => {
  it('keeps the health response shape', () => {
    const value: HealthResponse = { status: 'ok' };
    expect(value.status).toBe('ok');
  });

  it('validates the health response schema', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });
});
