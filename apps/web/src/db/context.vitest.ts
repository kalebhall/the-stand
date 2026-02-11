import { describe, expect, it } from 'vitest';

import { requireWardContext } from './context';

describe('requireWardContext', () => {
  it('returns trimmed ward id when present', () => {
    expect(requireWardContext(' ward-id ')).toBe('ward-id');
  });

  it('throws when ward id is empty', () => {
    expect(() => requireWardContext('   ')).toThrowError(
      'Ward context is required before executing ward-scoped queries.'
    );
  });
});
