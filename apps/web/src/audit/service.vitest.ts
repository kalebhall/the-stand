import { describe, expect, it, vi } from 'vitest';
import { buildFieldDiff, redactSensitiveData, recordAuditEvent } from './service';

describe('audit service', () => {
  describe('redactSensitiveData', () => {
    it('redacts password, token, and secret fields recursively', () => {
      const input = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'super-secret-password',
        passwordHash: '$argon2id$v=19$m=65536...',
        nested: {
          accessToken: 'secret-token-123',
          apiKey: 'key-456',
          recoveryKey: 'recovery-xyz',
          regularField: 'safe'
        },
        items: [{ secret: 'hidden', note: 'visible' }]
      };

      const redacted = redactSensitiveData(input);

      expect(redacted.name).toBe('John Doe');
      expect(redacted.email).toBe('john@example.com');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.passwordHash).toBe('[REDACTED]');
      expect(redacted.nested.accessToken).toBe('[REDACTED]');
      expect(redacted.nested.recoveryKey).toBe('[REDACTED]');
      expect(redacted.nested.regularField).toBe('safe');
      expect(redacted.items[0].secret).toBe('[REDACTED]');
      expect(redacted.items[0].note).toBe('visible');
    });

    it('handles primitive values and null/undefined gracefully', () => {
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
      expect(redactSensitiveData('string')).toBe('string');
      expect(redactSensitiveData(123)).toBe(123);
    });
  });

  describe('buildFieldDiff', () => {
    it('detects changed fields and formats old and new values', () => {
      const oldObj = {
        title: 'Old Title',
        placement: 'PROGRAM_TOP',
        isPermanent: false,
        createdAt: '2026-01-01T00:00:00Z'
      };

      const newObj = {
        title: 'New Title',
        placement: 'PROGRAM_TOP',
        isPermanent: true,
        createdAt: '2026-01-01T00:00:00Z'
      };

      const diff = buildFieldDiff(oldObj, newObj);

      expect(diff).toEqual({
        title: { old: 'Old Title', new: 'New Title' },
        isPermanent: { old: false, new: true }
      });
    });

    it('ignores timestamp and sensitive keys by default', () => {
      const oldObj = {
        name: 'Bishop',
        password: 'old-password',
        updatedAt: '2026-01-01T00:00:00Z'
      };

      const newObj = {
        name: 'Bishop',
        password: 'new-password',
        updatedAt: '2026-01-02T00:00:00Z'
      };

      const diff = buildFieldDiff(oldObj, newObj);
      expect(diff).toBeNull();
    });

    it('returns null if there are no changes', () => {
      const obj = { a: 1, b: 'test' };
      expect(buildFieldDiff(obj, obj)).toBeNull();
      expect(buildFieldDiff(null, null)).toBeNull();
    });
  });

  describe('recordAuditEvent', () => {
    it('executes parameterized INSERT into audit_log with all rich metadata', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
      const client = { query: mockQuery };

      await recordAuditEvent(client, {
        wardId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        actorName: 'Bishop Smith',
        actorRole: 'BISHOPRIC',
        action: 'CALLING_SUSTAINED',
        targetMemberId: '33333333-3333-3333-3333-333333333333',
        targetMemberName: 'Brother Jones',
        entityType: 'calling',
        entityId: '44444444-4444-4444-4444-444444444444',
        callingName: 'Elders Quorum President',
        organization: 'Elders Quorum',
        callingStatus: 'SUSTAINED',
        changes: {
          status: { old: 'PROPOSED', new: 'SUSTAINED' }
        },
        details: {
          callingAssignmentId: '44444444-4444-4444-4444-444444444444'
        },
        source: 'manual_ui',
        severity: 'notice',
        isCrossWardSupport: false
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain('INSERT INTO audit_log');
      expect(params[0]).toBe('11111111-1111-1111-1111-111111111111'); // wardId
      expect(params[1]).toBe('22222222-2222-2222-2222-222222222222'); // userId
      expect(params[2]).toBe('Bishop Smith'); // actorName
      expect(params[3]).toBe('BISHOPRIC'); // actorRole
      expect(params[4]).toBe('CALLING_SUSTAINED'); // action
      expect(params[5]).toBe('33333333-3333-3333-3333-333333333333'); // targetMemberId
      expect(params[6]).toBe('Brother Jones'); // targetMemberName
      expect(params[7]).toBe('calling'); // entityType
      expect(params[8]).toBe('44444444-4444-4444-4444-444444444444'); // entityId
      expect(JSON.parse(params[9])).toEqual({ status: { old: 'PROPOSED', new: 'SUSTAINED' } }); // changes
      expect(params[12]).toBe('manual_ui'); // source
      expect(params[13]).toBe('notice'); // severity
      expect(params[14]).toBe(false); // isCrossWardSupport
      expect(params[15]).toBe('Elders Quorum President'); // callingName
      expect(params[16]).toBe('Elders Quorum'); // organization
      expect(params[17]).toBe('SUSTAINED'); // callingStatus
    });
  });
});
