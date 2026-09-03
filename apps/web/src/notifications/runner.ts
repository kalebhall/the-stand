import type { PoolClient } from 'pg';

import { processNotificationDigest, queueNotificationDigest } from './digests';
import { deliverNotificationEmail, formatNotificationEmail } from './email';
import { getNotificationEmailPreferences } from './email-preferences';
import { formatUserNotification } from './format';
import { type NotificationDigestQueueJob } from './queue';
import { getSubscribedRecipientIds, isKnownNotificationEvent, resolveNotificationRecipients } from './recipients';
import { ensureDefaultNotificationSubscriptions } from './subscriptions';
import { createUserNotification } from './user-notifications';

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

type SafeEventPayload = Record<string, unknown>;

function asSafeEventPayload(payload: unknown): SafeEventPayload {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as SafeEventPayload) : {};
}

async function createRecipientNotifications(client: DbClient, event: OutboxEvent, wardId: string): Promise<NotificationDigestQueueJob[]> {
  const digestJobs: NotificationDigestQueueJob[] = [];
  if (!isKnownNotificationEvent(event.event_type)) {
    return digestJobs;
  }

  const payload = asSafeEventPayload(event.payload);
  const explicitUserIds = Array.isArray(payload.mentionedUserIds)
    ? payload.mentionedUserIds.filter((value): value is string => typeof value === 'string')
    : [];
  const recipientIds = await resolveNotificationRecipients(client, {
    wardId,
    eventType: event.event_type,
    actorUserId: typeof payload.actorUserId === 'string' ? payload.actorUserId : undefined,
    explicitUserIds
  });

  for (const recipientUserId of recipientIds) {
    await ensureDefaultNotificationSubscriptions(client, { wardId, userId: recipientUserId });
  }

  const subscribedRecipientIds = await getSubscribedRecipientIds(client, {
    wardId,
    eventType: event.event_type,
    channel: 'IN_APP',
    userIds: recipientIds
  });

  for (const recipientUserId of subscribedRecipientIds) {
    await createUserNotification(
      client,
      formatUserNotification({
        wardId,
        sourceEventId: event.id,
        eventType: event.event_type,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        payload: event.payload,
        recipientUserId
      })
    );
  }

  const emailRecipientIds = await getSubscribedRecipientIds(client, {
    wardId,
    eventType: event.event_type,
    channel: 'EMAIL',
    userIds: recipientIds
  });
  if (emailRecipientIds.length === 0) {
    return digestJobs;
  }

  const usersResult = await client.query(
    `SELECT id, email
       FROM user_account
      WHERE id = ANY($1::uuid[])`,
    [emailRecipientIds]
  );
  const emailPreferences = await getNotificationEmailPreferences(client, {
    wardId,
    userIds: emailRecipientIds
  });

  for (const user of (usersResult.rows ?? []) as Array<{ id: string; email: string | null }>) {
    const notification = formatUserNotification({
      wardId,
      sourceEventId: event.id,
      eventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      payload: event.payload,
      recipientUserId: user.id
    });
    const preference = emailPreferences.get(user.id);
    if (!preference) {
      continue;
    }

    if (preference.frequency === 'IMMEDIATE') {
      const message = formatNotificationEmail({
        eventType: event.event_type,
        recipientEmail: user.email,
        title: notification.title,
        summary: notification.summary,
        targetUrl: notification.targetUrl ?? null,
        severity: notification.severity
      });
      if (!message) continue;

      const deliveryResult = await client.query(
        `INSERT INTO notification_delivery (ward_id, event_outbox_id, recipient_user_id, channel, delivery_status, attempted_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'EMAIL', 'pending', now())
         ON CONFLICT (event_outbox_id, channel, recipient_user_id) WHERE channel = 'EMAIL'
         DO UPDATE SET attempted_at = now(), updated_at = now()
         RETURNING id`,
        [wardId, event.id, user.id]
      );
      const deliveryId = deliveryResult.rows[0]?.id as string | undefined;
      if (!deliveryId) {
        throw new Error(`Failed to create immediate notification delivery for recipient ${user.id}`);
      }

      try {
        const delivery = await deliverNotificationEmail(message);
        await client.query(
          `UPDATE notification_delivery
              SET delivery_status = 'success',
                  external_id = $3::text,
                  error_message = NULL,
                  attempted_at = now(),
                  updated_at = now()
            WHERE id = $1::uuid
              AND ward_id = $2::uuid`,
          [deliveryId, wardId, delivery.externalId ?? null]
        );
      } catch (error) {
        await client.query(
          `UPDATE notification_delivery
              SET delivery_status = 'failure',
                  error_message = $3::text,
                  attempted_at = now(),
                  updated_at = now()
            WHERE id = $1::uuid
              AND ward_id = $2::uuid`,
          [deliveryId, wardId, error instanceof Error ? error.message : 'Unknown email delivery error']
        );
      }
      continue;
    }

    const digestJob = await queueNotificationDigest(client, {
      wardId,
      eventOutboxId: event.id,
      recipientUserId: user.id,
      title: notification.title,
      summary: notification.summary,
      targetUrl: notification.targetUrl ?? null,
      preference: {
        frequency: preference.frequency,
        timezone: preference.timezone
      }
    });
    digestJobs.push({
      kind: 'digest-delivery',
      wardId: digestJob.wardId,
      recipientUserId: digestJob.recipientUserId,
      frequency: digestJob.frequency,
      digestItemId: digestJob.digestItemId,
      runAt: digestJob.runAt
    });
  }

  return digestJobs;
}

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

export async function processOutboxEvent(
  client: DbClient,
  params: { wardId: string; eventOutboxId: string }
): Promise<NotificationDigestQueueJob[]> {
  const outboxResult = await client.query(
    `SELECT id,
            aggregate_type,
            aggregate_id,
            event_type,
            payload,
            attempts,
            status,
            available_at <= now() AS available_now
       FROM event_outbox
      WHERE ward_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [params.wardId, params.eventOutboxId]
  );

  if (!outboxResult.rowCount) {
    throw new Error(`Outbox event ${params.eventOutboxId} not visible yet for ward ${params.wardId}.`);
  }

  const event = outboxResult.rows[0] as OutboxEvent & { status: string; available_now: boolean };

  if (event.status !== 'pending' || !event.available_now) {
    return [];
  }

  await client.query(
    `UPDATE event_outbox
        SET status = 'processing',
            attempts = attempts + 1,
            updated_at = now()
      WHERE id = $1::uuid
        AND ward_id = $2::uuid`,
    [event.id, params.wardId]
  );

  const digestJobs = await createRecipientNotifications(client, event, params.wardId);

  const deliveryResult = await client.query(
    `INSERT INTO notification_delivery (ward_id, event_outbox_id, channel, delivery_status, attempted_at)
     VALUES ($1::uuid, $2::uuid, 'webhook', 'pending', now())
     ON CONFLICT (event_outbox_id, channel) WHERE channel = 'webhook'
     DO UPDATE SET attempted_at = now(), updated_at = now()
     RETURNING id`,
    [params.wardId, event.id]
  );

  const deliveryId = deliveryResult.rows[0]?.id as string | undefined;
  if (!deliveryId) {
    throw new Error(`Failed to create webhook delivery for outbox event ${event.id}`);
  }

  try {
    const delivery = await deliverWebhookEvent(event);
    await markNotificationDeliverySuccess(client, {
      wardId: params.wardId,
      deliveryId,
      externalId: delivery.externalId
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown webhook delivery error';

    await markNotificationDeliveryFailure(client, {
      wardId: params.wardId,
      deliveryId,
      eventOutboxId: event.id,
      attempts: event.attempts + 1,
      errorMessage
    });

    // Webhook delivery is auxiliary. Keep recipient notifications committed even
    // when webhook delivery fails, then retain the failure for diagnostics.
    await client.query(
      `UPDATE event_outbox
          SET status = 'processed',
              updated_at = now()
        WHERE id = $1::uuid
          AND ward_id = $2::uuid`,
      [event.id, params.wardId]
    );
  }

  return digestJobs;
}

export async function markNotificationDeliverySuccess(
  client: DbClient,
  params: { wardId: string; deliveryId: string; externalId?: string }
): Promise<void> {
  await client.query(
    `UPDATE notification_delivery
        SET delivery_status = 'success',
            external_id = COALESCE($3::text, external_id),
            error_message = NULL,
            attempted_at = now(),
            updated_at = now()
      WHERE id = $1::uuid
        AND ward_id = $2::uuid`,
    [params.deliveryId, params.wardId, params.externalId ?? null]
  );

  await client.query(
    `UPDATE event_outbox eo
        SET status = 'processed',
            updated_at = now()
       FROM notification_delivery nd
      WHERE nd.id = $1::uuid
        AND nd.ward_id = $2::uuid
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
            error_message = $3::text,
            attempted_at = now(),
            updated_at = now()
      WHERE id = $1::uuid
        AND ward_id = $2::uuid`,
    [params.deliveryId, params.wardId, params.errorMessage]
  );

  const backoffSeconds = calculateRetryBackoffSeconds(params.attempts);

  await client.query(
    `UPDATE event_outbox eo
        SET status = 'pending',
            available_at = now() + ($4::text || ' seconds')::interval,
            last_error = $3::text,
            updated_at = now()
      WHERE eo.id = $1::uuid
        AND eo.ward_id = $2::uuid`,
    [params.eventOutboxId, params.wardId, params.errorMessage, String(backoffSeconds)]
  );
}

export { processNotificationDigest };
