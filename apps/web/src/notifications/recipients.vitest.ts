import { describe, expect, it, vi } from 'vitest';

import {
  getExplicitRecipientIds,
  getRecipientPolicyKey,
  getRecipientRoles,
  isKnownNotificationEvent,
  resolveNotificationRecipients
} from './recipients';

describe('notification recipients', () => {
  it('maps event types to explicit recipient policies', () => {
    expect(getRecipientPolicyKey('CALLING_SUGGESTED')).toBe('CALLING_MANAGERS');
    expect(getRecipientPolicyKey('MEMBER_UPDATED')).toBe('MEMBERSHIP_VIEWERS');
    expect(getRecipientPolicyKey('MEETING_PUBLISHED')).toBe('MEETING_VIEWERS');
    expect(getRecipientPolicyKey('NOTE_CREATED')).toBe('INTERNAL_NOTE_READERS');
    expect(getRecipientPolicyKey('ACCESS_REQUEST_SUBMITTED')).toBe('ACCESS_ADMINISTRATORS');
    expect(getRecipientPolicyKey('SYSTEM_FAILURE')).toBe('NO_DEFAULT_RECIPIENTS');
  });

  it('returns least-privilege role sets and removes duplicate explicit users', () => {
    expect(getRecipientRoles('ACCESS_ADMINISTRATORS')).toEqual(['STAND_ADMIN']);
    expect(getExplicitRecipientIds({
      wardId: 'ward-1',
      eventType: 'NOTE_MENTIONED',
      actorUserId: 'user-1',
      explicitUserIds: ['user-1', 'user-2', 'user-2', ' ']
    })).toEqual(['user-2']);
  });

  it('resolves active, unrevoked recipients within the requested ward', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'user-2' }, { user_id: 'user-3' }] });
    const result = await resolveNotificationRecipients(
      { query },
      { wardId: 'ward-1', eventType: 'CALLING_SUGGESTED', actorUserId: 'user-1' }
    );

    expect(result).toEqual(['user-2', 'user-3']);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('wur.ward_id = $1::uuid');
    expect(sql).toContain('wur.revoked_at IS NULL');
    expect(sql).toContain('wur.expires_at > now()');
    expect(sql).toContain('wur.user_id <>');
    expect(values[0]).toBe('ward-1');
  });

  it('rejects unknown event names before resolving recipients', () => {
    expect(isKnownNotificationEvent('NOT_REAL')).toBe(false);
  });
});
