import type { PoolClient } from 'pg';

export type NotificationDiagnosticRow = {
  deliveryId: string;
  eventOutboxId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  deliveryStatus: string;
  attemptedAt: string | null;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
};

export async function fetchNotificationDiagnostics(
  client: Pick<PoolClient, 'query'>,
  wardId: string,
  limit = 25
): Promise<NotificationDiagnosticRow[]> {
  const result = await client.query(
    `SELECT nd.id AS delivery_id,
            nd.event_outbox_id,
            eo.event_type,
            eo.aggregate_type,
            eo.aggregate_id,
            nd.delivery_status,
            nd.attempted_at,
            nd.error_message,
            eo.attempts,
            nd.created_at
       FROM notification_delivery nd
       JOIN event_outbox eo
         ON eo.id = nd.event_outbox_id
        AND eo.ward_id = nd.ward_id
      WHERE nd.ward_id = $1
      ORDER BY nd.created_at DESC
      LIMIT $2`,
    [wardId, limit]
  );

  return result.rows.map((row) => ({
    deliveryId: row.delivery_id as string,
    eventOutboxId: row.event_outbox_id as string,
    eventType: row.event_type as string,
    aggregateType: row.aggregate_type as string,
    aggregateId: row.aggregate_id as string,
    deliveryStatus: row.delivery_status as string,
    attemptedAt: row.attempted_at ? new Date(row.attempted_at as string).toISOString() : null,
    errorMessage: (row.error_message as string | null) ?? null,
    attempts: Number(row.attempts),
    createdAt: new Date(row.created_at as string).toISOString()
  }));
}
