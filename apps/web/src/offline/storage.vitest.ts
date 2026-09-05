import { describe, expect, it } from 'vitest';

import { isOfflineContextMatch } from './storage';

describe('offline storage context isolation', () => {
  it('accepts the active user and ward context', () => {
    expect(isOfflineContextMatch({ id: 'current', userId: 'user-1', wardId: 'ward-1' }, 'user-1', 'ward-1')).toBe(true);
  });

  it('rejects a different user or ward', () => {
    const context = { id: 'current' as const, userId: 'user-1', wardId: 'ward-1' };
    expect(isOfflineContextMatch(context, 'user-2', 'ward-1')).toBe(false);
    expect(isOfflineContextMatch(context, 'user-1', 'ward-2')).toBe(false);
    expect(isOfflineContextMatch(undefined, 'user-1', 'ward-1')).toBe(false);
  });
});
