import { describe, expect, it } from 'vitest';

import type { HealthResponse } from './index';

describe('shared placeholders', () => {
  it('keeps the health response shape', () => {
    const value: HealthResponse = { status: 'ok' };
    expect(value.status).toBe('ok');
  });
});
