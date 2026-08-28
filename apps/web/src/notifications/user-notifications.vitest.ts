import { describe, expect, it, vi } from 'vitest';

import {
  countUnreadUserNotifications,
  createUserNotification,
  dismissUserNotification,
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead
} from './user-notifications';

const notificationRow = {
  id: 'notification-1',
  ward_id: 'ward-1',
  recipient_user_id: 'user-1',
  source_event_id: 'event-1',
  event_type: 'MEETING_PUBLISHED',
  aggregate_type: 'meeting',
  aggregate_id: 'meeting-1',
  title: 'Meeting published',
  summary: 'Meeting is ready.',
  details: { meetingDate: '2026-08-30' },
  severity: 'info',
  target_url: '/meetings/meeting-1/edit',
  read_at: null,
  dismissed_at: null,
  created_at: '2026-08-28T12:00:00Z'
};

function clientWithResults(results: unknown[]) {
  const query = vi.fn();
  for (const result of results) {
    query.mockResolvedValueOnce(result);
  }
  return { query };
}

describe('user notifications', () => {
  it('creates a notification with JSON details and returns the inserted row', async () => {
    const client = clientWithResults([{ rows: [notificationRow], rowCount: 1 }]);

    const result = await createUserNotification(client, {
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      sourceEventId: 'event-1',
      eventType: 'MEETING_PUBLISHED',
      aggregateType: 'meeting',
      aggregateId: 'meeting-1',
      title: 'Meeting published',
      summary: 'Meeting is ready.',
      details: { meetingDate: '2026-08-30' },
      severity: 'info',
      targetUrl: '/meetings/meeting-1/edit'
    });

    expect(result).toEqual({
      id: 'notification-1',
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      sourceEventId: 'event-1',
      eventType: 'MEETING_PUBLISHED',
      aggregateType: 'meeting',
      aggregateId: 'meeting-1',
      title: 'Meeting published',
      summary: 'Meeting is ready.',
      details: { meetingDate: '2026-08-30' },
      severity: 'info',
      targetUrl: '/meetings/meeting-1/edit',
      readAt: null,
      dismissedAt: null,
      createdAt: '2026-08-28T12:00:00Z'
    });
    const [query, values] = client.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('ON CONFLICT (recipient_user_id, source_event_id) DO NOTHING');
    expect(query).toContain('$1::uuid');
    expect(query).toContain('$9::jsonb');
    expect(values[0]).toBe('ward-1');
  });

  it('loads the existing scoped notification after an idempotent conflict', async () => {
    const client = clientWithResults([
      { rows: [], rowCount: 0 },
      { rows: [notificationRow], rowCount: 1 }
    ]);

    const result = await createUserNotification(client, {
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      sourceEventId: 'event-1',
      eventType: 'MEETING_PUBLISHED',
      aggregateType: 'meeting',
      aggregateId: 'meeting-1',
      title: 'Meeting published',
      summary: 'Meeting is ready.',
      severity: 'info'
    });

    expect(result.id).toBe('notification-1');
    const [, values] = client.query.mock.calls[1] as [string, unknown[]];
    expect(values).toEqual(['ward-1', 'user-1', 'event-1']);
  });

  it('lists only current user and ward notifications with safe filtering and limit', async () => {
    const client = clientWithResults([{ rows: [notificationRow], rowCount: 1 }]);

    const result = await listUserNotifications(client, {
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      filter: 'unread',
      category: 'MEETINGS',
      limit: 500
    });

    expect(result[0]?.id).toBe('notification-1');
    const [query, values] = client.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('ward_id = $1::uuid');
    expect(query).toContain('recipient_user_id = $2::uuid');
    expect(query).toContain('read_at IS NULL');
    expect(query).toContain('LIMIT $');
    expect(values.slice(0, 2)).toEqual(['ward-1', 'user-1']);
    expect(values.at(-1)).toBe(100);
  });

  it('rejects invalid filters and limits before querying', async () => {
    const client = clientWithResults([]);

    await expect(listUserNotifications(client, {
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      filter: 'later' as never
    })).rejects.toThrow('Invalid notification filter');

    await expect(listUserNotifications(client, {
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      limit: 0
    })).rejects.toThrow('positive integer');

    expect(client.query).not.toHaveBeenCalled();
  });

  it('counts unread notifications and scopes state mutations', async () => {
    const countClient = clientWithResults([{ rows: [{ count: '3' }], rowCount: 1 }]);
    await expect(countUnreadUserNotifications(countClient, {
      wardId: 'ward-1',
      recipientUserId: 'user-1'
    })).resolves.toBe(3);

    const readClient = clientWithResults([{ rows: [], rowCount: 1 }]);
    await expect(markUserNotificationRead(readClient, {
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      notificationId: 'notification-1'
    })).resolves.toBe(true);
    expect((readClient.query.mock.calls[0] as [string, unknown[]])[0]).toContain('recipient_user_id = $3::uuid');

    const dismissClient = clientWithResults([{ rows: [], rowCount: 0 }]);
    await expect(dismissUserNotification(dismissClient, {
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      notificationId: 'notification-1'
    })).resolves.toBe(false);

    const allReadClient = clientWithResults([{ rows: [], rowCount: 2 }]);
    await expect(markAllUserNotificationsRead(allReadClient, {
      wardId: 'ward-1',
      recipientUserId: 'user-1'
    })).resolves.toBe(2);
  });
});
