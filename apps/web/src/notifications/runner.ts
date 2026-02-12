import type { PoolClient } from 'pg';

type DbClient = Pick<PoolClient, 'query'>;

const DEFAULT_NOTIFICATION_WEBHOOK_URL = 'http://127.0.0.1:5678/webhook/the-stand';
const MAX_RETRY_BACKOFF_SECONDS = 300;

type OutboxEvent = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
};

function getNotificationWebhookUrl(): string {
  return process.env.NOTIFICATION_WEBHOOK_URL ?? DEFAULT_NOTIFICATION_WEBHOOK_URL;
}

function calculateRetryBackoffSeconds(attempts: number): number {
  return Math.min(MAX_RETRY_BACKOFF_SECONDS, Math.max(5, 2 ** Math.max(0, attempts - 1) * 5));
}

async function deliverWebhookEvent(event: OutboxEvent): Promise<{ externalId?: string }> {
  const webhookUrl = getNotificationWebhookUrl();
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': event.id
    },
    body: JSON.stringify({
      eventId: event.id,
      eventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      payload: event.payload
    })
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Webhook delivery failed (${response.status}): ${responseBody.slice(0, 500)}`);
  }

  const externalIdHeader = response.headers.get('x-delivery-id');
  return { externalId: externalIdHeader ?? undefined };
}

export async function runNotificationWorkerForWard(client: DbClient, wardId: string): Promise<void> {
  while (true) {
    const outboxResult = await client.query(
      `SELECT id,
              aggregate_type,
              aggregate_id,
              event_type,
              payload,
              attempts
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

    const event = outboxResult.rows[0] as OutboxEvent;
    const eventOutboxId = event.id;

    await client.query(
      `UPDATE event_outbox
          SET status = 'processing',
              attempts = attempts + 1,
              updated_at = now()
        WHERE id = $1 AND ward_id = $2`,
      [eventOutboxId, wardId]
    );

    const deliveryResult = await client.query(
      `INSERT INTO notification_delivery (ward_id, event_outbox_id, channel, delivery_status, attempted_at)
       VALUES ($1, $2, 'webhook', 'pending', now())
       ON CONFLICT (event_outbox_id, channel)
       DO UPDATE SET attempted_at = now(), updated_at = now()
       RETURNING id`,
      [wardId, eventOutboxId]
    );

    const deliveryId = deliveryResult.rows[0].id as string;

    try {
      const delivery = await deliverWebhookEvent(event);
      await markNotificationDeliverySuccess(client, {
        wardId,
        deliveryId,
        externalId: delivery.externalId
      });
    } catch (error) {
      await markNotificationDeliveryFailure(client, {
        wardId,
        deliveryId,
        eventOutboxId,
        attempts: event.attempts + 1,
        errorMessage: error instanceof Error ? error.message : 'Unknown webhook delivery error'
      });
    }
  }
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
  params: { wardId: string; deliveryId: string; eventOutboxId: string; attempts: number; errorMessage: string }
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

  const backoffSeconds = calculateRetryBackoffSeconds(params.attempts);

  await client.query(
    `UPDATE event_outbox eo
        SET status = 'pending',
            available_at = now() + ($4::text || ' seconds')::interval,
            last_error = $3,
            updated_at = now()
      WHERE eo.id = $1
        AND eo.ward_id = $2`,
    [params.eventOutboxId, params.wardId, params.errorMessage, String(backoffSeconds)]
  );
}
