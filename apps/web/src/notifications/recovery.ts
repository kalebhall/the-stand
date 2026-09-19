import type { PoolClient } from 'pg';

import { setDbContext } from '@/src/db/context';

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

export async function findPendingGlobalEmailDeliveries(client: DbClient, limit = 50): Promise<PendingGlobalEmailDelivery[]> {
  const result = await client.query(
    `SELECT id
       FROM global_notification_delivery
      WHERE channel = 'EMAIL'
        AND delivery_status = 'pending'
      ORDER BY created_at
      LIMIT $1::int`,
    [limit]
  );
  return (result.rows as Array<{ id: string }>).map((row) => ({ globalNotificationDeliveryId: row.id }));
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
