import { describe, expect, it, vi } from 'vitest';

import {
  buildDefaultRows,
  ensureDefaultNotificationSubscriptions,
  getNotificationSubscriptions,
  updateNotificationSubscriptions
} from './subscriptions';

function createClient(rows: unknown[][] = []) {
  const query = vi.fn();
  for (const resultRows of rows) {
    query.mockResolvedValueOnce({ rows: resultRows, rowCount: resultRows.length });
  }
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  return { query };
}

describe('notification subscriptions', () => {
  it('builds explicit in-app and email defaults for every event', () => {
    const defaults = buildDefaultRows();

    expect(defaults).toHaveLength(116);
    expect(defaults).toContainEqual({
      eventType: 'CALLING_SUGGESTED',
      category: 'CALLINGS',
      channel: 'IN_APP',
      enabled: true
    });
    expect(defaults).toContainEqual({
      eventType: 'CALLING_SUGGESTED',
      category: 'CALLINGS',
      channel: 'EMAIL',
      enabled: true
    });
    expect(defaults).toContainEqual({
      eventType: 'MEETING_UPDATED',
      category: 'MEETINGS',
      channel: 'EMAIL',
      enabled: false
    });
  });

  it('inserts defaults idempotently with ward and user scope', async () => {
    const client = createClient();

    await ensureDefaultNotificationSubscriptions(client, {
      wardId: 'ward-1',
      userId: 'user-1'
    });

    expect(client.query).toHaveBeenCalledTimes(1);
    const [query, values] = client.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('ON CONFLICT (ward_id, user_id, event_type, channel) DO NOTHING');
    expect(query).toContain('$1::uuid');
    expect(query).toContain('$2::uuid');
    expect(values.slice(0, 2)).toEqual(['ward-1', 'user-1']);
    expect(values).toHaveLength(2 + 116 * 4);
  });

  it('groups stored channel rows and derives labels from the event registry', async () => {
    const client = createClient([
      [],
      [
        { event_type: 'MEETING_UPDATED', category: 'MEETINGS', channel: 'IN_APP', enabled: true },
        { event_type: 'MEETING_UPDATED', category: 'MEETINGS', channel: 'EMAIL', enabled: false },
        { event_type: 'CALLING_SUGGESTED', category: 'CALLINGS', channel: 'IN_APP', enabled: false },
        { event_type: 'CALLING_SUGGESTED', category: 'CALLINGS', channel: 'EMAIL', enabled: true }
      ]
    ]);

    const result = await getNotificationSubscriptions(client, {
      wardId: 'ward-1',
      userId: 'user-1'
    });

    expect(result).toEqual([
      {
        eventType: 'CALLING_SUGGESTED',
        category: 'CALLINGS',
        label: 'Calling suggested',
        channels: { IN_APP: false, EMAIL: true }
      },
      {
        eventType: 'MEETING_UPDATED',
        category: 'MEETINGS',
        label: 'Meeting changed',
        channels: { IN_APP: true, EMAIL: false }
      }
    ]);

    const [readQuery] = client.query.mock.calls[1] as [string, unknown[]];
    expect(readQuery).toContain('ward_id = $1::uuid');
    expect(readQuery).toContain('user_id = $2::uuid');
  });

  it('rejects empty, unknown, invalid, and duplicate updates before database writes', async () => {
    const client = createClient();

    await expect(
      updateNotificationSubscriptions(client, {
        wardId: 'ward-1',
        userId: 'user-1',
        updates: []
      })
    ).rejects.toThrow('At least one notification subscription update is required');

    await expect(
      updateNotificationSubscriptions(client, {
        wardId: 'ward-1',
        userId: 'user-1',
        updates: [{ eventType: 'NOT_REAL' as never, channel: 'IN_APP', enabled: true }]
      })
    ).rejects.toThrow('Unknown notification event type');

    await expect(
      updateNotificationSubscriptions(client, {
        wardId: 'ward-1',
        userId: 'user-1',
        updates: [{ eventType: 'MEETING_UPDATED', channel: 'SMS' as never, enabled: true }]
      })
    ).rejects.toThrow('Invalid notification channel');

    await expect(
      updateNotificationSubscriptions(client, {
        wardId: 'ward-1',
        userId: 'user-1',
        updates: [
          { eventType: 'MEETING_UPDATED', channel: 'IN_APP', enabled: true },
          { eventType: 'MEETING_UPDATED', channel: 'IN_APP', enabled: false }
        ]
      })
    ).rejects.toThrow('Duplicate notification subscription update');

    expect(client.query).not.toHaveBeenCalled();
  });

  it('upserts explicit updates and returns scoped preferences', async () => {
    const client = createClient([
      { rows: [], rowCount: 0 } as unknown as unknown[],
      [],
      [{ event_type: 'MEETING_UPDATED', category: 'MEETINGS', channel: 'EMAIL', enabled: true }]
    ]);

    const result = await updateNotificationSubscriptions(client, {
      wardId: 'ward-1',
      userId: 'user-1',
      updates: [{ eventType: 'MEETING_UPDATED', channel: 'EMAIL', enabled: true }]
    });

    expect(result[0]?.channels.EMAIL).toBe(true);
    const [upsertQuery, values] = client.query.mock.calls[0] as [string, unknown[]];
    expect(upsertQuery).toContain('DO UPDATE SET');
    expect(upsertQuery).toContain('updated_at = now()');
    expect(values.slice(0, 2)).toEqual(['ward-1', 'user-1']);
  });
});
