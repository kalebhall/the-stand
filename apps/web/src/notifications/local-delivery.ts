import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import { setDbContext } from '@/src/db/context';
import { deliverNotificationEmail, formatNotificationEmail, usableEmail } from './email';
import { formatUserNotification } from './format';
import type { NotificationEventType } from './events';

type DbClient = Pick<PoolClient, 'query'>;

type LocalDelivery = {
  id: string;
  delivery_status: 'pending' | 'failed' | 'processing';
  attempts: number;
  channel: 'EMAIL' | 'webhook';
  ward_id: string;
  event_id: string;
  event_type: NotificationEventType;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  recipient_user_id: string | null;
  email: string | null;
  is_active: boolean | null;
};

const DEFAULT_NOTIFICATION_WEBHOOK_URL = 'http://127.0.0.1:5678/webhook/the-stand';
const DELIVERY_LEASE_MINUTES = 15;
const WORKER_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

function getNotificationWebhookUrl(): string {
  return process.env.NOTIFICATION_WEBHOOK_URL ?? DEFAULT_NOTIFICATION_WEBHOOK_URL;
}

async function deliverWebhook(delivery: LocalDelivery): Promise<{ externalId?: string }> {
  const response = await fetch(getNotificationWebhookUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `notification-delivery:${delivery.id}`
    },
    body: JSON.stringify({
      eventId: delivery.event_id,
      eventType: delivery.event_type,
      aggregateType: delivery.aggregate_type,
      aggregateId: delivery.aggregate_id,
      payload: delivery.payload
    }),
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Webhook delivery failed (${response.status}): ${responseBody.slice(0, 500)}`);
  }

  return { externalId: response.headers.get('x-delivery-id') ?? undefined };
}

async function claimDelivery(
  client: DbClient,
  deliveryId: string,
  wardId?: string
): Promise<{ delivery: LocalDelivery; leaseToken: string } | null> {
  const leaseToken = randomUUID();
  await client.query('BEGIN');
  try {
    if (wardId) await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId });
    const suppressedResult = await client.query(
      `UPDATE notification_delivery d
          SET delivery_status = 'suppressed',
              lease_token = NULL,
              processing_started_at = NULL,
              updated_at = now(),
              error_message = CASE
                WHEN e.aggregate_type = 'internal_note' THEN 'Suppressed because the note is not public.'
                WHEN d.channel = 'EMAIL' AND (
                  d.recipient_user_id IS NULL
                  OR NOT EXISTS (
                    SELECT 1
                      FROM user_account recipient_email
                     WHERE recipient_email.id = d.recipient_user_id
                       AND btrim(recipient_email.email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
                  )
                ) THEN 'Suppressed because the recipient has no usable email address.'
                ELSE 'Suppressed because the recipient is no longer an active ward member.'
              END
         FROM event_outbox e
        WHERE d.id = $1::uuid
          AND e.id = d.event_outbox_id
          AND e.ward_id = d.ward_id
          AND d.delivery_status IN ('pending', 'failed', 'processing')
          AND (
            (e.aggregate_type = 'internal_note' AND COALESCE(e.payload->>'visibility', '') <> 'PUBLIC')
            OR (
              d.channel = 'EMAIL'
              AND (
                NOT EXISTS (
                  SELECT 1
                    FROM ward_user_role wur
                    JOIN user_account recipient ON recipient.id = wur.user_id
                   WHERE wur.ward_id = d.ward_id
                     AND wur.user_id = d.recipient_user_id
                     AND recipient.is_active = TRUE
                     AND wur.revoked_at IS NULL
                     AND (wur.expires_at IS NULL OR wur.expires_at > now())
                )
                OR d.recipient_user_id IS NULL
                OR NOT EXISTS (
                  SELECT 1
                    FROM user_account recipient_email
                   WHERE recipient_email.id = d.recipient_user_id
                     AND btrim(recipient_email.email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
                )
              )
            )
          )`,
      [deliveryId]
    );
    if ((suppressedResult as { rowCount?: number }).rowCount) {
      await client.query('COMMIT');
      return null;
    }
    const result = await client.query(
      `SELECT d.id,
              d.delivery_status,
              d.attempts,
              d.channel,
              d.ward_id,
              d.recipient_user_id,
              e.id AS event_id,
              e.event_type,
              e.aggregate_type,
              e.aggregate_id,
              e.payload,
              u.email,
              u.is_active
         FROM notification_delivery d
         JOIN event_outbox e ON e.id = d.event_outbox_id AND e.ward_id = d.ward_id
         LEFT JOIN user_account u ON u.id = d.recipient_user_id
        WHERE d.id = $1::uuid
          AND d.channel IN ('EMAIL', 'webhook')
          AND NOT EXISTS (
            SELECT 1
              FROM notification_email_digest_item di
             WHERE di.delivery_id = d.id
          )
          AND (e.aggregate_type <> 'internal_note' OR COALESCE(e.payload->>'visibility', '') = 'PUBLIC')
          AND (
            d.channel = 'webhook'
            OR btrim(u.email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
          )
          AND (
            d.channel = 'webhook'
            OR EXISTS (
              SELECT 1
                FROM ward_user_role wur
                JOIN user_account recipient ON recipient.id = wur.user_id
               WHERE wur.ward_id = d.ward_id
                 AND wur.user_id = d.recipient_user_id
                 AND recipient.is_active = TRUE
                 AND wur.revoked_at IS NULL
                 AND (wur.expires_at IS NULL OR wur.expires_at > now())
            )
          )
          AND (
            d.delivery_status IN ('pending', 'failed')
            OR (
              d.delivery_status = 'processing'
              AND COALESCE(d.processing_started_at, d.attempted_at) < now() - interval '${DELIVERY_LEASE_MINUTES} minutes'
            )
          )
          AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [deliveryId]
    );

    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }

    const delivery = result.rows[0] as LocalDelivery;
    await client.query(
      `UPDATE notification_delivery
          SET delivery_status = 'processing',
              lease_token = $2::uuid,
              attempts = attempts + 1,
              processing_started_at = now(),
              attempted_at = now(),
              next_attempt_at = NULL,
              updated_at = now()
        WHERE id = $1::uuid`,
      [delivery.id, leaseToken]
    );
    await client.query('COMMIT');
    return { delivery, leaseToken };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function finalizeSuccess(client: DbClient, delivery: LocalDelivery, leaseToken: string, externalId?: string): Promise<void> {
  await client.query('BEGIN');
  try {
    await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: delivery.ward_id });
    await client.query(
      `UPDATE notification_delivery
          SET delivery_status = 'success',
              lease_token = NULL,
              processing_started_at = NULL,
              next_attempt_at = NULL,
              external_id = COALESCE($2::text, external_id),
              error_message = NULL,
              attempted_at = now(),
              updated_at = now()
        WHERE id = $1::uuid
          AND delivery_status = 'processing'
          AND lease_token = $3::uuid`,
      [delivery.id, externalId ?? null, leaseToken]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function finalizeFailure(client: DbClient, delivery: LocalDelivery, leaseToken: string, errorMessage: string): Promise<void> {
  await client.query('BEGIN');
  try {
    await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: delivery.ward_id });
    await client.query(
      `UPDATE notification_delivery
          SET delivery_status = 'failed',
              lease_token = NULL,
              processing_started_at = NULL,
              next_attempt_at = now() + LEAST(3600, GREATEST(10, power(2, attempts - 1) * 5)) * interval '1 second',
              error_message = $2::text,
              attempted_at = now(),
              updated_at = now()
        WHERE id = $1::uuid
          AND delivery_status = 'processing'
          AND lease_token = $3::uuid`,
      [delivery.id, errorMessage, leaseToken]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function processNotificationDelivery(client: DbClient, deliveryId: string, wardId?: string): Promise<void> {
  const claimed = await claimDelivery(client, deliveryId, wardId);
  if (!claimed) return;

  const { delivery, leaseToken } = claimed;
  try {
    if (delivery.channel === 'webhook') {
      const result = await deliverWebhook(delivery);
      await finalizeSuccess(client, delivery, leaseToken, result.externalId);
      return;
    }

    if (!delivery.recipient_user_id || !delivery.is_active || !usableEmail(delivery.email)) {
      throw new Error('Notification email delivery skipped because the recipient account has no usable email address.');
    }

    const notification = formatUserNotification({
      wardId: delivery.ward_id,
      sourceEventId: delivery.event_id,
      eventType: delivery.event_type,
      aggregateType: delivery.aggregate_type,
      aggregateId: delivery.aggregate_id,
      payload: delivery.payload,
      recipientUserId: delivery.recipient_user_id
    });
    const message = formatNotificationEmail({
      eventType: delivery.event_type,
      recipientEmail: delivery.email,
      title: notification.title,
      summary: notification.summary,
      targetUrl: notification.targetUrl ?? null,
      severity: notification.severity
    });
    if (!message) throw new Error('Notification email delivery skipped because the recipient account has no usable email address.');

    const result = await deliverNotificationEmail(message, { idempotencyKey: `notification-delivery:${delivery.id}` });
    await finalizeSuccess(client, delivery, leaseToken, result.externalId);
  } catch (error) {
    await finalizeFailure(client, delivery, leaseToken, error instanceof Error ? error.message : String(error));
  }
}
