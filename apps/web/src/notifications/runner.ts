import type { PoolClient } from 'pg';

type DbClient = Pick<PoolClient, 'query'>;

export async function runNotificationWorkerForWard(client: DbClient, wardId: string): Promise<void> {
  const outboxResult = await client.query(
    `SELECT id
       FROM event_outbox
      WHERE ward_id = $1
        AND status = 'pending'
        AND available_at <= now()
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [wardId]
  );

  if (!outboxResult.rowCount) {
    return;
  }

  const eventOutboxId = outboxResult.rows[0].id as string;

  await client.query(
    `INSERT INTO notification_delivery (ward_id, event_outbox_id, channel, delivery_status, attempted_at)
     VALUES ($1, $2, 'webhook', 'pending', now())
     ON CONFLICT (event_outbox_id, channel) DO NOTHING`,
    [wardId, eventOutboxId]
  );

  await client.query(
    `UPDATE event_outbox
        SET status = 'processing',
            attempts = attempts + 1,
            updated_at = now()
      WHERE id = $1 AND ward_id = $2`,
    [eventOutboxId, wardId]
  );
}

export async function markNotificationDeliverySuccess(
  client: DbClient,
  params: { wardId: string; deliveryId: string; externalId?: string }
): Promise<void> {
  await client.query(
    `UPDATE notification_delivery
        SET delivery_status = 'success',
            external_id = COALESCE($3, external_id),
            error_message = NULL,
            attempted_at = now(),
            updated_at = now()
      WHERE id = $1 AND ward_id = $2`,
    [params.deliveryId, params.wardId, params.externalId ?? null]
  );

  await client.query(
    `UPDATE event_outbox eo
        SET status = 'processed',
            updated_at = now()
       FROM notification_delivery nd
      WHERE nd.id = $1
        AND nd.ward_id = $2
        AND eo.id = nd.event_outbox_id
        AND eo.ward_id = nd.ward_id`,
    [params.deliveryId, params.wardId]
  );
}

export async function markNotificationDeliveryFailure(
  client: DbClient,
  params: { wardId: string; deliveryId: string; errorMessage: string }
): Promise<void> {
  await client.query(
    `UPDATE notification_delivery
        SET delivery_status = 'failure',
            error_message = $3,
            attempted_at = now(),
            updated_at = now()
      WHERE id = $1 AND ward_id = $2`,
    [params.deliveryId, params.wardId, params.errorMessage]
  );

  await client.query(
    `UPDATE event_outbox eo
        SET status = 'failed',
            last_error = $3,
            updated_at = now()
       FROM notification_delivery nd
      WHERE nd.id = $1
        AND nd.ward_id = $2
        AND eo.id = nd.event_outbox_id
        AND eo.ward_id = nd.ward_id`,
    [params.deliveryId, params.wardId, params.errorMessage]
  );
}
