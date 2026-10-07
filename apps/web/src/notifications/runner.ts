import type { PoolClient } from 'pg';

import { processNotificationDigest, queueNotificationDigest } from './digests';
import { formatNotificationEmail } from './email';
import { getNotificationEmailPreferences } from './email-preferences';
import { formatUserNotification } from './format';
import { type NotificationDigestQueueJob } from './queue';
import { getSubscribedRecipientIds, isKnownNotificationEvent, resolveNotificationRecipients } from './recipients';
import { ensureDefaultNotificationSubscriptions } from './subscriptions';
import { createUserNotification } from './user-notifications';

type DbClient = Pick<PoolClient, 'query'>;

const MAX_RETRY_BACKOFF_SECONDS = 300;
const NOTE_EVENT_TYPES = new Set(['NOTE_CREATED', 'NOTE_UPDATED', 'NOTE_DELETED', 'NOTE_MENTIONED', 'COMMENT_CREATED', 'COMMENT_UPDATED']);

type OutboxEvent = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
};

export type NotificationOutboxProcessingResult = {
  digestJobs: NotificationDigestQueueJob[];
  localDeliveryIds: string[];
};

type SafeEventPayload = Record<string, unknown>;

function asSafeEventPayload(payload: unknown): SafeEventPayload {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as SafeEventPayload) : {};
}

function isNonPublicNoteEvent(event: Pick<OutboxEvent, 'aggregate_type' | 'event_type' | 'payload'>): boolean {
  if (event.aggregate_type !== 'internal_note' || !NOTE_EVENT_TYPES.has(event.event_type)) return false;
  const visibility = asSafeEventPayload(event.payload).visibility;
  return visibility !== 'PUBLIC';
}

async function createRecipientNotifications(
  client: DbClient,
  event: OutboxEvent,
  wardId: string
): Promise<NotificationOutboxProcessingResult> {
  const digestJobs: NotificationDigestQueueJob[] = [];
  const localDeliveryIds: string[] = [];
  if (!isKnownNotificationEvent(event.event_type)) {
    return { digestJobs, localDeliveryIds };
  }

  const payload = asSafeEventPayload(event.payload);
  const explicitUserIds = Array.isArray(payload.mentionedUserIds)
    ? payload.mentionedUserIds.filter((value): value is string => typeof value === 'string')
    : [];
  const recipientIds = await resolveNotificationRecipients(client, {
    wardId,
    eventType: event.event_type,
    actorUserId: typeof payload.actorUserId === 'string' ? payload.actorUserId : undefined,
    explicitUserIds,
    visibility:
      payload.visibility === 'PUBLIC' || payload.visibility === 'LEADERSHIP' || payload.visibility === 'PRIVATE'
        ? payload.visibility
        : undefined
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

  const emailRecipientIds = isNonPublicNoteEvent(event)
    ? []
    : await getSubscribedRecipientIds(client, {
        wardId,
        eventType: event.event_type,
        channel: 'EMAIL',
        userIds: recipientIds
      });
  if (emailRecipientIds.length === 0) {
    return { digestJobs, localDeliveryIds };
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
    if (!preference) continue;

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
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'EMAIL', 'pending', NULL)
         ON CONFLICT (event_outbox_id, channel, recipient_user_id) WHERE channel = 'EMAIL'
         DO UPDATE SET updated_at = now()
         RETURNING id, delivery_status`,
        [wardId, event.id, user.id]
      );
      const deliveryId = deliveryResult.rows[0]?.id as string | undefined;
      if (!deliveryId) throw new Error(`Failed to create immediate notification delivery for recipient ${user.id}`);
      if (deliveryResult.rows[0]?.delivery_status !== 'success') localDeliveryIds.push(deliveryId);
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

  return { digestJobs, localDeliveryIds };
}

export async function processOutboxEvent(
  client: DbClient,
  params: { wardId: string; eventOutboxId: string }
): Promise<NotificationOutboxProcessingResult> {
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
  if (event.status !== 'pending' || !event.available_now) return { digestJobs: [], localDeliveryIds: [] };

  await client.query(
    `UPDATE event_outbox
        SET status = 'processing',
            attempts = attempts + 1,
            updated_at = now()
      WHERE id = $1::uuid
        AND ward_id = $2::uuid`,
    [event.id, params.wardId]
  );

  const result = await createRecipientNotifications(client, event, params.wardId);
  if (!isNonPublicNoteEvent(event)) {
    const deliveryResult = await client.query(
      `INSERT INTO notification_delivery (ward_id, event_outbox_id, channel, delivery_status, attempted_at)
       VALUES ($1::uuid, $2::uuid, 'webhook', 'pending', NULL)
       ON CONFLICT (event_outbox_id, channel) WHERE channel = 'webhook'
       DO UPDATE SET updated_at = now()
       RETURNING id, delivery_status`,
      [params.wardId, event.id]
    );
    const deliveryId = deliveryResult.rows[0]?.id as string | undefined;
    if (!deliveryId) throw new Error(`Failed to create webhook delivery for outbox event ${event.id}`);
    if (deliveryResult.rows[0]?.delivery_status !== 'success') result.localDeliveryIds.push(deliveryId);
  }

  await client.query(
    `UPDATE event_outbox
        SET status = 'processed',
            updated_at = now()
      WHERE id = $1::uuid
        AND ward_id = $2::uuid`,
    [event.id, params.wardId]
  );
  return result;
}

function calculateRetryBackoffSeconds(attempts: number): number {
  return Math.min(MAX_RETRY_BACKOFF_SECONDS, Math.max(5, 2 ** Math.max(0, attempts - 1) * 5));
}

/** Compatibility helpers for callers that finalize a previously-created delivery. */
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
        SET delivery_status = 'failed',
            error_message = $3::text,
            attempted_at = now(),
            next_attempt_at = now() + ($4::text || ' seconds')::interval,
            updated_at = now()
      WHERE id = $1::uuid
        AND ward_id = $2::uuid`,
    [params.deliveryId, params.wardId, params.errorMessage, String(calculateRetryBackoffSeconds(params.attempts))]
  );
}

export { processNotificationDigest };
