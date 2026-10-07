import { describe, expect, it, vi } from 'vitest';

import { findPendingDigestDeliveries, findPendingLocalNotificationDeliveries, findPendingOutboxEvents } from './recovery';

describe('notification outbox recovery', () => {
  it('discovers pending events per ward under RLS context', async () => {
    const queryMock = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      if (sql === 'SELECT id FROM ward ORDER BY id') return { rows: [{ id: 'ward-1' }, { id: 'ward-2' }], rowCount: 2 };
      if (sql.includes('FROM event_outbox')) {
        return { rows: [{ id: values?.[0] === 'ward-1' ? 'event-1' : 'event-2' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(findPendingOutboxEvents({ query: queryMock }, 10)).resolves.toEqual([
      { wardId: 'ward-1', eventOutboxId: 'event-1' },
      { wardId: 'ward-2', eventOutboxId: 'event-2' }
    ]);

    expect(queryMock).toHaveBeenCalledWith('SELECT set_config($1, $2, true)', ['app.ward_id', 'ward-1']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("status = 'pending'"), ['ward-2', 9]);
  });

  it('reclaims stale digest delivery claims before rediscovery', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql === 'SELECT id FROM ward ORDER BY id') return { rows: [{ id: 'ward-1' }], rowCount: 1 };
      if (sql.includes('UPDATE notification_delivery d')) return { rows: [], rowCount: 1 };
      if (sql.includes('FROM notification_email_digest_item')) {
        return {
          rows: [
            {
              ward_id: 'ward-1',
              recipient_user_id: 'user-1',
              digest_frequency: 'DAILY',
              id: 'digest-1',
              scheduled_for: '2026-10-07T10:00:00.000Z'
            }
          ],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(findPendingDigestDeliveries({ query: queryMock }, 10)).resolves.toEqual([
      {
        wardId: 'ward-1',
        recipientUserId: 'user-1',
        frequency: 'DAILY',
        digestItemId: 'digest-1',
        runAt: '2026-10-07T10:00:00.000Z'
      }
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("d.delivery_status = 'processing'"), ['ward-1']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('d.next_attempt_at IS NULL OR d.next_attempt_at <= now()'), ['ward-1', 10]);
  });
  it('rediscovers pending, failed, and stale processing deliveries by ward', async () => {
    const queryMock = vi.fn(async (sql: string, _values?: readonly unknown[]) => {
      if (sql === 'SELECT id FROM ward ORDER BY id') return { rows: [{ id: 'ward-1' }], rowCount: 1 };
      if (sql.includes('FROM notification_delivery')) {
        return { rows: [{ id: 'delivery-1' }, { id: 'delivery-2' }], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(findPendingLocalNotificationDeliveries({ query: queryMock }, 10)).resolves.toEqual([
      { wardId: 'ward-1', notificationDeliveryId: 'delivery-1' },
      { wardId: 'ward-1', notificationDeliveryId: 'delivery-2' }
    ]);

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("delivery_status IN ('pending', 'failed')"), ['ward-1', 10]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("delivery_status = 'processing'"), ['ward-1', 10]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('d.next_attempt_at IS NULL OR d.next_attempt_at <= now()'), ['ward-1', 10]);
  });
});
