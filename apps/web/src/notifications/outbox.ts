import type { PoolClient } from 'pg';

import { getNotificationEventDefinition, type NotificationEventType } from './events';

export type NotificationOutboxParams = {
  wardId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: NotificationEventType;
  payload?: Record<string, unknown>;
};

export async function insertNotificationOutboxEvent(
  client: Pick<PoolClient, 'query'>,
  params: NotificationOutboxParams
): Promise<string | null> {
  getNotificationEventDefinition(params.eventType);
  const result = await client.query(
    `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1::uuid, $2::text, $3::uuid, $4::text, $5::jsonb)
     ON CONFLICT (ward_id, event_type, aggregate_id)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'
     RETURNING id`,
    [params.wardId, params.aggregateType, params.aggregateId, params.eventType, JSON.stringify(params.payload ?? {})]
  );
  return result?.rows?.[0]?.id ?? null;
}

export function enqueueNotificationOutboxEvent(
  enqueue: (payload: { wardId: string; eventOutboxId: string }) => Promise<unknown> | unknown,
  wardId: string,
  eventOutboxId: string | null
): void {
  if (!eventOutboxId) return;
  Promise.resolve(enqueue({ wardId, eventOutboxId })).catch((error) => {
    console.error('[notifications] Failed to enqueue outbox event', error);
  });
}
