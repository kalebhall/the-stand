import type { PoolClient } from 'pg';

import { getNotificationEventDefinition, type NotificationEventType } from './events';

export type GlobalNotificationEventType =
  | 'SUPPORT_REQUEST_CREATED'
  | 'USER_REQUIRES_ASSIGNMENT'
  | 'SUPPORT_REQUEST_ASSIGNED'
  | 'SUPPORT_REQUEST_STATUS_CHANGED';

export type GlobalNotificationOutboxParams = {
  aggregateType: string;
  aggregateId: string;
  eventType: GlobalNotificationEventType;
  payload?: Record<string, unknown>;
};

export async function insertGlobalNotificationEvent(
  client: Pick<PoolClient, 'query'>,
  params: GlobalNotificationOutboxParams
): Promise<string | null> {
  getNotificationEventDefinition(params.eventType as NotificationEventType);
  const result = await client.query(
    `INSERT INTO global_event_outbox (aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1::text, $2::uuid, $3::text, $4::jsonb)
     ON CONFLICT (event_type, aggregate_id)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'
     RETURNING id`,
    [params.aggregateType, params.aggregateId, params.eventType, JSON.stringify(params.payload ?? {})]
  );
  return result.rows[0]?.id ?? null;
}

export function enqueueGlobalNotificationEvent(
  enqueue: (payload: { globalEventOutboxId: string }) => Promise<unknown> | unknown,
  globalEventOutboxId: string | null
): void {
  if (!globalEventOutboxId) return;
  Promise.resolve(enqueue({ globalEventOutboxId })).catch((error) => {
    console.error('[notifications] Failed to enqueue global event', error);
  });
}
