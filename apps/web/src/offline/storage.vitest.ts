import { describe, expect, it } from 'vitest';

import { formatOfflineAge, getOfflineSnapshotAge, isOfflineAuthorizationMatch, isOfflineContextMatch, parseOfflineAuthorization } from './storage';

describe('offline storage context isolation', () => {
  it('accepts the active user and ward context', () => {
    expect(isOfflineContextMatch({ id: 'current', userId: 'user-1', wardId: 'ward-1' }, 'user-1', 'ward-1')).toBe(true);
  });

  it('requires the online authorization to match the cached context', () => {
    const context = { id: 'current' as const, userId: 'user-1', wardId: 'ward-1' };
    expect(isOfflineAuthorizationMatch(context, { userId: 'user-1', wardId: 'ward-1' })).toBe(true);
    expect(isOfflineAuthorizationMatch(context, { userId: 'user-2', wardId: 'ward-1' })).toBe(false);
    expect(isOfflineAuthorizationMatch(context, { userId: 'user-1', wardId: null })).toBe(false);
    expect(isOfflineAuthorizationMatch(context, undefined)).toBe(false);
  });

  it('parses only complete online authorization responses', () => {
    expect(parseOfflineAuthorization({ user: { id: 'user-1' }, activeWardId: 'ward-1' })).toEqual({ userId: 'user-1', wardId: 'ward-1' });
    expect(parseOfflineAuthorization({ user: { id: 'user-1' }, activeWardId: null })).toEqual({ userId: 'user-1', wardId: null });
    expect(parseOfflineAuthorization({ user: {}, activeWardId: 'ward-1' })).toBeUndefined();
    expect(parseOfflineAuthorization({ user: { id: 'user-1' } })).toBeUndefined();
    expect(parseOfflineAuthorization(null)).toBeUndefined();
  });

  it('classifies and formats snapshot age without overstating future timestamps', () => {
    const now = Date.parse('2026-09-07T12:00:00.000Z');
    expect(getOfflineSnapshotAge('2026-09-07T11:30:00.000Z', now)).toEqual({ ageMs: 1_800_000, isStale: false });
    expect(formatOfflineAge('2026-09-07T11:30:00.000Z', now)).toBe('30 minutes ago');
    expect(formatOfflineAge('2026-09-07T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(formatOfflineAge('2026-09-05T12:00:00.000Z', now)).toBe('2 days ago');
    expect(getOfflineSnapshotAge('2026-09-07T13:00:00.000Z', now)).toEqual({ ageMs: 0, isStale: false });
    expect(formatOfflineAge('not-a-date', now)).toBe('unknown age');
  });
});
