import type { PoolClient } from 'pg';

import { setDbContext } from '@/src/db/context';
import type { NotificationDigestFrequency } from '@/src/notifications/email-preferences';

const WORKER_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

type DbClient = Pick<PoolClient, 'query'>;

export type PendingOutboxEvent = {
  wardId: string;
  eventOutboxId: string;
};

export type PendingGlobalOutboxEvent = {
  globalEventOutboxId: string;
};

export type PendingGlobalEmailDelivery = {
  globalNotificationDeliveryId: string;
};

export type PendingDigestDelivery = {
  wardId: string;
  recipientUserId: string;
  frequency: NotificationDigestFrequency;
  digestItemId: string;
  runAt: string;
};

export type PendingLocalNotificationDelivery = {
  wardId: string;
  notificationDeliveryId: string;
};

export async function findPendingLocalNotificationDeliveries(client: DbClient, limit = 50): Promise<PendingLocalNotificationDelivery[]> {
  const wardsResult = await client.query('SELECT id FROM ward ORDER BY id');
  const deliveries: PendingLocalNotificationDelivery[] = [];

  for (const ward of wardsResult.rows as Array<{ id: string }>) {
    if (deliveries.length >= limit) break;

    await client.query('BEGIN');
    try {
      await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: ward.id });
      const result = await client.query(
        `SELECT d.id
           FROM notification_delivery d
          WHERE d.ward_id = $1::uuid
            AND d.channel IN ('EMAIL', 'webhook')
            AND NOT EXISTS (
              SELECT 1
                FROM notification_email_digest_item di
               WHERE di.delivery_id = d.id
            )
            AND (
              d.delivery_status IN ('pending', 'failed')
              OR (
                d.delivery_status = 'processing'
                AND COALESCE(d.processing_started_at, d.attempted_at) < now() - interval '15 minutes'
              )
            )
            AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
          ORDER BY d.created_at
          LIMIT $2::int`,
        [ward.id, limit - deliveries.length]
      );
      deliveries.push(
        ...(result.rows as Array<{ id: string }>).map((row) => ({
          wardId: ward.id,
          notificationDeliveryId: row.id
        }))
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  return deliveries;
}

export async function findPendingGlobalEmailDeliveries(client: DbClient, limit = 50): Promise<PendingGlobalEmailDelivery[]> {
  const result = await client.query(
    `SELECT id
       FROM global_notification_delivery
      WHERE channel = 'EMAIL'
        AND (
          delivery_status IN ('pending', 'failed')
          OR (
            delivery_status = 'processing'
            AND (
              processing_started_at < now() - interval '15 minutes'
              OR (processing_started_at IS NULL AND attempted_at < now() - interval '15 minutes')
            )
          )
        )
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY created_at
      LIMIT $1::int`,
    [limit]
  );
  return (result.rows as Array<{ id: string }>).map((row) => ({ globalNotificationDeliveryId: row.id }));
}

export async function findPendingDigestDeliveries(client: DbClient, limit = 50): Promise<PendingDigestDelivery[]> {
  const wardsResult = await client.query('SELECT id FROM ward ORDER BY id');
  const deliveries: PendingDigestDelivery[] = [];
  for (const ward of wardsResult.rows as Array<{ id: string }>) {
    if (deliveries.length >= limit) break;
    await client.query('BEGIN');
    try {
      await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: ward.id });
      await client.query(
        `UPDATE notification_delivery d
            SET delivery_status = 'failed',
                lease_token = NULL,
                processing_started_at = NULL,
                attempted_at = now() - interval '5 minutes',
                next_attempt_at = now(),
                error_message = 'Recovered stale digest delivery claim.',
                updated_at = now()
           FROM notification_email_digest_item di
          WHERE di.delivery_id = d.id
            AND di.ward_id = $1::uuid
            AND d.ward_id = di.ward_id
            AND d.delivery_status = 'processing'
            AND d.processing_started_at < now() - interval '15 minutes'`,
        [ward.id]
      );
      const result = await client.query(
        `SELECT di.ward_id, di.recipient_user_id, di.digest_frequency, di.id, di.scheduled_for
           FROM notification_email_digest_item di
           JOIN notification_delivery d ON d.id = di.delivery_id AND d.ward_id = di.ward_id
          WHERE di.ward_id = $1::uuid
            AND di.delivered_at IS NULL
            AND di.scheduled_for <= now()
            AND d.delivery_status IN ('pending', 'failed')
            AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
            AND (di.attempted_at IS NULL OR di.attempted_at <= now() - interval '5 minutes')
          ORDER BY di.scheduled_for, di.created_at
          LIMIT $2::int`,
        [ward.id, limit - deliveries.length]
      );
      deliveries.push(
        ...(
          result.rows as Array<{ ward_id: string; recipient_user_id: string; digest_frequency: string; id: string; scheduled_for: string }>
        ).map((row) => ({
          wardId: row.ward_id,
          recipientUserId: row.recipient_user_id,
          frequency: row.digest_frequency as NotificationDigestFrequency,
          digestItemId: row.id,
          runAt: row.scheduled_for
        }))
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  return deliveries;
}
export async function findPendingGlobalOutboxEvents(client: DbClient, limit = 50): Promise<PendingGlobalOutboxEvent[]> {
  const result = await client.query(
    `SELECT id
       FROM global_event_outbox
      WHERE status = 'pending'
        AND available_at <= now()
      ORDER BY created_at
      LIMIT $1::int`,
    [limit]
  );

  return (result.rows as Array<{ id: string }>).map((row) => ({ globalEventOutboxId: row.id }));
}

/**
 * Re-discovers pending events whose enqueue call was lost after commit.
 * Each ward is read inside its own RLS context; no cross-ward event data is returned.
 */
export async function findPendingOutboxEvents(client: DbClient, limit = 50): Promise<PendingOutboxEvent[]> {
  const wardsResult = await client.query('SELECT id FROM ward ORDER BY id');
  const events: PendingOutboxEvent[] = [];

  for (const ward of wardsResult.rows as Array<{ id: string }>) {
    if (events.length >= limit) break;

    await client.query('BEGIN');
    try {
      await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: ward.id });
      const pendingResult = await client.query(
        `SELECT id
           FROM event_outbox
          WHERE ward_id = $1::uuid
            AND status = 'pending'
            AND available_at <= now()
          ORDER BY created_at
          LIMIT $2::int`,
        [ward.id, limit - events.length]
      );
      events.push(
        ...(pendingResult.rows as Array<{ id: string }>).map((row) => ({
          wardId: ward.id,
          eventOutboxId: row.id
        }))
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  return events;
}
