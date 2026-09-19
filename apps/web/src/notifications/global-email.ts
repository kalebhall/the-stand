import type { PoolClient } from 'pg';

import { deliverNotificationEmail, formatNotificationEmail } from './email';

type DbClient = Pick<PoolClient, 'query'>;

type EmailDelivery = {
  id: string;
  delivery_status: string;
  email: string;
  event_type: string;
  title: string;
  summary: string;
  target_url: string | null;
  severity: 'info' | 'success' | 'warning' | 'error';
};

export async function processGlobalEmailDelivery(client: DbClient, deliveryId: string): Promise<void> {
  const result = await client.query(
    `SELECT d.id, d.delivery_status, u.email, n.event_type, n.title, n.summary, n.target_url, n.severity
       FROM global_notification_delivery d
       JOIN user_account u ON u.id = d.recipient_user_id
       JOIN global_user_notification n
         ON n.source_event_id = d.global_event_outbox_id
        AND n.recipient_user_id = d.recipient_user_id
      WHERE d.id = $1::uuid
        AND d.channel = 'EMAIL'
      LIMIT 1`,
    [deliveryId]
  );
  if (!result.rowCount) return;

  const delivery = result.rows[0] as EmailDelivery;
  if (delivery.delivery_status === 'success') return;

  try {
    const message = formatNotificationEmail({
      eventType: delivery.event_type,
      recipientEmail: delivery.email,
      title: delivery.title,
      summary: delivery.summary,
      targetUrl: delivery.target_url,
      severity: delivery.severity
    });
    if (!message) throw new Error('Recipient has no usable email address.');
    const sent = await deliverNotificationEmail(message);
    await client.query(
      `UPDATE global_notification_delivery
          SET delivery_status = 'success', external_id = $2::text, error_message = NULL,
              attempted_at = now(), updated_at = now()
        WHERE id = $1::uuid`,
      [delivery.id, sent.externalId ?? null]
    );
  } catch (error) {
    await client.query(
      `UPDATE global_notification_delivery
          SET delivery_status = 'failed', error_message = $2::text,
              attempted_at = now(), updated_at = now()
        WHERE id = $1::uuid`,
      [delivery.id, error instanceof Error ? error.message : String(error)]
    );
    throw error;
  }
}
