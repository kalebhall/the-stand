import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

import { deliverNotificationEmail, formatNotificationEmail } from './email';

type DbClient = Pick<PoolClient, 'query'>;

type EmailDelivery = {
  id: string;
  delivery_status: string;
  attempts: number;
  is_active: boolean;
  email: string;
  event_type: string;
  title: string;
  summary: string;
  target_url: string | null;
  severity: 'info' | 'success' | 'warning' | 'error';
};

export async function processGlobalEmailDelivery(client: DbClient, deliveryId: string): Promise<void> {
  const leaseToken = randomUUID();
  await client.query('BEGIN');
  let result: { rowCount: number | null; rows: unknown[] };
  let delivery: EmailDelivery;
  try {
    result = await client.query(
      `SELECT d.id, d.delivery_status, d.attempts, u.is_active, u.email, n.event_type, n.title, n.summary, n.target_url, n.severity
       FROM global_notification_delivery d
       JOIN user_account u ON u.id = d.recipient_user_id
       JOIN global_user_notification n
         ON n.source_event_id = d.global_event_outbox_id
        AND n.recipient_user_id = d.recipient_user_id
      WHERE d.id = $1::uuid
        AND d.channel = 'EMAIL'
        AND (
          d.delivery_status IN ('pending', 'failed')
          OR (d.delivery_status = 'processing' AND d.attempted_at < now() - interval '15 minutes')
        )
        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
      [deliveryId]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return;
    }

    delivery = result.rows[0] as EmailDelivery;
    await client.query(
      `UPDATE global_notification_delivery
        SET delivery_status = 'processing', lease_token = $2::uuid, attempts = attempts + 1,
            next_attempt_at = NULL, processing_started_at = now(), attempted_at = now(), updated_at = now()
      WHERE id = $1::uuid`,
      [delivery.id, leaseToken]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }

  if (!delivery.is_active) {
    await client.query('BEGIN');
    try {
      await client.query(
        `UPDATE global_notification_delivery
            SET delivery_status = 'skipped', lease_token = NULL, processing_started_at = NULL, next_attempt_at = NULL,
                error_message = 'Recipient account is inactive', updated_at = now()
          WHERE id = $1::uuid AND delivery_status = 'processing' AND lease_token = $2::uuid`,
        [delivery.id, leaseToken]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
    return;
  }

  try {
    const message = formatNotificationEmail({
      eventType: delivery.event_type,
      recipientEmail: delivery.email,
      title: delivery.title,
      summary: delivery.summary,
      targetUrl: delivery.target_url,
      severity: delivery.severity
    });
    if (!message) {
      await client.query('BEGIN');
      try {
        await client.query(
          `UPDATE global_notification_delivery
              SET delivery_status = 'skipped',
                  lease_token = NULL,
                  processing_started_at = NULL,
                  next_attempt_at = NULL,
                  error_message = 'Recipient has no usable email address.',
                  updated_at = now()
            WHERE id = $1::uuid
              AND delivery_status = 'processing'
              AND lease_token = $2::uuid`,
          [delivery.id, leaseToken]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
      return;
    }
    const sent = await deliverNotificationEmail(message, { idempotencyKey: `global-notification-delivery:${delivery.id}` });
    await client.query('BEGIN');
    await client.query(
      `UPDATE global_notification_delivery
          SET delivery_status = 'success', lease_token = NULL, processing_started_at = NULL, next_attempt_at = NULL,
              external_id = $2::text, error_message = NULL,
              attempted_at = now(), updated_at = now()
        WHERE id = $1::uuid AND delivery_status = 'processing' AND lease_token = $3::uuid`,
      [delivery.id, sent.externalId ?? null, leaseToken]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.query('BEGIN');
    await client.query(
      `UPDATE global_notification_delivery
          SET delivery_status = 'failed', lease_token = NULL, processing_started_at = NULL,
              next_attempt_at = now() + LEAST(3600, GREATEST(60, power(2, attempts - 1) * 60)) * interval '1 second',
              error_message = $2::text,
              attempted_at = now(), updated_at = now()
        WHERE id = $1::uuid AND delivery_status = 'processing' AND lease_token = $3::uuid`,
      [delivery.id, error instanceof Error ? error.message : String(error), leaseToken]
    );
    await client.query('COMMIT');
    throw error;
  }
}
