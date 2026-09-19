import type { PoolClient } from 'pg';

import { emailProviderConfigured, usableEmail } from './email';
import { getNotificationEventDefinition, type NotificationEventType } from './events';

type DbClient = Pick<PoolClient, 'query'>;

type GlobalEvent = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: NotificationEventType;
  payload: unknown;
  attempts: number;
  status: string;
  available_now: boolean;
};

function safePayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

function formatGlobalSummary(eventType: NotificationEventType, payload: unknown): string {
  const data = safePayload(payload);
  if (eventType === 'SUPPORT_REQUEST_STATUS_CHANGED' && typeof data.status === 'string') {
    return `Support work item status changed to ${data.status}.`;
  }
  if (eventType === 'SUPPORT_REQUEST_ASSIGNED') {
    return 'A support work item was assigned and needs follow-up.';
  }
  if (eventType === 'USER_REQUIRES_ASSIGNMENT') {
    return 'A user requires support assignment before access can be completed.';
  }
  if (eventType === 'SUPPORT_REQUEST_REMINDER') {
    return 'An unassigned support work item is still awaiting attention.';
  }
  return 'A new support work item requires attention.';
}

export async function processGlobalOutboxEvent(client: DbClient, globalEventOutboxId: string): Promise<string[]> {
  const eventResult = await client.query(
    `SELECT id, aggregate_type, aggregate_id, event_type, payload, attempts, status,
            available_at <= now() AS available_now
       FROM global_event_outbox
      WHERE id = $1::uuid
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [globalEventOutboxId]
  );

  if (!eventResult.rowCount) return [];

  const event = eventResult.rows[0] as GlobalEvent;
  if (event.status !== 'pending' || !event.available_now) return [];

  await client.query(
    `UPDATE global_event_outbox
        SET status = 'processing', attempts = attempts + 1, updated_at = now()
      WHERE id = $1::uuid`,
    [event.id]
  );

  const definition = getNotificationEventDefinition(event.event_type);
  const recipients = await client.query(
    `SELECT DISTINCT u.id, u.email
       FROM user_account u
       JOIN user_global_role ugr ON ugr.user_id = u.id
       JOIN role r ON r.id = ugr.role_id
      WHERE u.is_active = true
        AND r.name IN ('SUPPORT_ADMIN', 'SYSTEM_ADMIN')`
  );
  const summary = formatGlobalSummary(event.event_type, event.payload);

  const emailDeliveryIds: string[] = [];
  for (const recipient of recipients.rows as Array<{ id: string; email: string | null }>) {
    const notification = await client.query(
      `INSERT INTO global_user_notification (
         recipient_user_id, source_event_id, event_type, aggregate_type, aggregate_id,
         title, summary, details, severity, target_url
       )
       VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::uuid, $6::text, $7::text, NULL, $8::text, '/support/queue')
       ON CONFLICT (recipient_user_id, source_event_id) DO NOTHING
       RETURNING id`,
      [recipient.id, event.id, event.event_type, event.aggregate_type, event.aggregate_id, definition.label, summary, definition.severity]
    );

    if (notification.rowCount && definition.defaultChannels.includes('EMAIL') && usableEmail(recipient.email) && emailProviderConfigured()) {
      const emailDelivery = await client.query(
        `INSERT INTO global_notification_delivery (
           global_event_outbox_id, recipient_user_id, channel, delivery_status
         )
         VALUES ($1::uuid, $2::uuid, 'EMAIL', 'pending')
         ON CONFLICT (global_event_outbox_id, recipient_user_id, channel) DO NOTHING
         RETURNING id`,
        [event.id, recipient.id]
      );
      if (emailDelivery.rowCount) emailDeliveryIds.push(emailDelivery.rows[0].id as string);
    }

    if (notification.rowCount) {
      await client.query(
        `INSERT INTO global_notification_delivery (
           global_event_outbox_id, recipient_user_id, channel, delivery_status, attempted_at
         )
         VALUES ($1::uuid, $2::uuid, 'IN_APP', 'success', now())
         ON CONFLICT (global_event_outbox_id, recipient_user_id, channel) DO NOTHING`,
        [event.id, recipient.id]
      );
    }
  }

  await client.query(
    `UPDATE global_event_outbox
        SET status = 'processed', updated_at = now()
      WHERE id = $1::uuid`,
    [event.id]
    );

    return emailDeliveryIds;
    }
