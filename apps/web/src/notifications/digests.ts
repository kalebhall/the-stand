import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import { setDbContext } from '@/src/db/context';
import { deliverNotificationEmail, formatDigestNotificationEmail, usableEmail } from './email';
import { getNextDigestDeliveryTime, type NotificationDigestFrequency, type NotificationEmailPreference } from './email-preferences';

type DbClient = Pick<PoolClient, 'query'>;

const WORKER_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

type DigestItemRow = {
  id: string;
  delivery_id: string;
  title: string;
  summary: string;
  target_url: string | null;
  scheduled_for: string;
};

export type QueueNotificationDigestParams = {
  wardId: string;
  eventOutboxId: string;
  recipientUserId: string;
  title: string;
  summary: string;
  targetUrl: string | null;
  preference: NotificationEmailPreference & { frequency: NotificationDigestFrequency };
};

export type NotificationDigestJob = {
  wardId: string;
  recipientUserId: string;
  frequency: NotificationDigestFrequency;
  digestItemId: string;
  runAt: string;
};

export async function queueNotificationDigest(client: DbClient, params: QueueNotificationDigestParams): Promise<NotificationDigestJob> {
  const scheduledFor = getNextDigestDeliveryTime({
    frequency: params.preference.frequency,
    timeZone: params.preference.timezone
  });

  const deliveryResult = await client.query(
    `INSERT INTO notification_delivery (ward_id, event_outbox_id, recipient_user_id, channel, delivery_status, attempted_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'EMAIL', 'pending', NULL)
     ON CONFLICT (event_outbox_id, channel, recipient_user_id) WHERE channel = 'EMAIL'
     DO UPDATE SET updated_at = now()
     RETURNING id`,
    [params.wardId, params.eventOutboxId, params.recipientUserId]
  );

  const deliveryId = deliveryResult.rows[0]?.id as string | undefined;
  if (!deliveryId) {
    throw new Error(`Failed to create notification delivery for digest recipient ${params.recipientUserId}`);
  }

  const digestItemResult = await client.query(
    `INSERT INTO notification_email_digest_item (
       ward_id,
       recipient_user_id,
       event_outbox_id,
       delivery_id,
       digest_frequency,
       scheduled_for,
       title,
       summary,
       target_url
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::timestamptz, $7::text, $8::text, $9::text)
     ON CONFLICT (delivery_id)
     DO UPDATE SET
       digest_frequency = EXCLUDED.digest_frequency,
       scheduled_for = EXCLUDED.scheduled_for,
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       target_url = EXCLUDED.target_url,
       updated_at = now(),
       last_error = NULL
     RETURNING id, scheduled_for`,
    [
      params.wardId,
      params.recipientUserId,
      params.eventOutboxId,
      deliveryId,
      params.preference.frequency,
      scheduledFor.toISOString(),
      params.title,
      params.summary,
      params.targetUrl
    ]
  );

  const digestItem = digestItemResult.rows[0] as { id: string; scheduled_for: string } | undefined;
  if (!digestItem) {
    throw new Error(`Failed to create notification digest item for recipient ${params.recipientUserId}`);
  }

  return {
    wardId: params.wardId,
    recipientUserId: params.recipientUserId,
    frequency: params.preference.frequency,
    digestItemId: digestItem.id,
    runAt: digestItem.scheduled_for
  };
}

export async function processNotificationDigest(
  client: DbClient,
  params: { wardId: string; recipientUserId: string; frequency: NotificationDigestFrequency }
): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [
    `notification-digest:${params.wardId}:${params.recipientUserId}:${params.frequency}`
  ]);
  await client.query(
    `WITH suppressed AS (
       UPDATE notification_delivery d
          SET delivery_status = 'suppressed',
              lease_token = NULL,
              processing_started_at = NULL,
              next_attempt_at = NULL,
              error_message = 'Digest item suppressed because the event is not public or the recipient is no longer eligible.',
              attempted_at = now(),
              updated_at = now()
         FROM notification_email_digest_item di
         JOIN event_outbox e ON e.id = di.event_outbox_id AND e.ward_id = di.ward_id
        WHERE di.ward_id = $1::uuid
          AND di.recipient_user_id = $2::uuid
          AND di.digest_frequency = $3::text
          AND di.delivered_at IS NULL
          AND d.id = di.delivery_id
          AND d.ward_id = di.ward_id
          AND (
            d.delivery_status = 'suppressed'
            OR (
              d.delivery_status IN ('pending', 'failed')
              AND (
                (e.aggregate_type = 'internal_note' AND COALESCE(e.payload->>'visibility', '') <> 'PUBLIC')
                OR NOT EXISTS (
                  SELECT 1
                    FROM ward_user_role wur
                    JOIN user_account recipient ON recipient.id = wur.user_id
                   WHERE wur.ward_id = di.ward_id
                     AND wur.user_id = di.recipient_user_id
                     AND recipient.is_active = TRUE
                     AND wur.revoked_at IS NULL
                     AND (wur.expires_at IS NULL OR wur.expires_at > now())
                )
              )
            )
          )
        RETURNING d.id
     )
     UPDATE notification_email_digest_item di
        SET delivered_at = now(),
            attempted_at = now(),
            last_error = 'Digest item suppressed because the event is not public or the recipient is no longer eligible.',
            updated_at = now()
       FROM suppressed
      WHERE di.ward_id = $1::uuid
        AND di.recipient_user_id = $2::uuid
        AND di.digest_frequency = $3::text
        AND di.delivered_at IS NULL
        AND di.delivery_id = suppressed.id`,
    [params.wardId, params.recipientUserId, params.frequency]
  );
  const digestResult = await client.query(
    `SELECT di.id, di.delivery_id, di.title, di.summary, di.target_url, di.scheduled_for
       FROM notification_email_digest_item di
       JOIN notification_delivery d ON d.id = di.delivery_id
       JOIN event_outbox e ON e.id = di.event_outbox_id AND e.ward_id = di.ward_id
      WHERE di.ward_id = $1::uuid
        AND di.recipient_user_id = $2::uuid
        AND di.digest_frequency = $3::text
        AND di.delivered_at IS NULL
        AND di.scheduled_for <= now()
        AND d.delivery_status IN ('pending', 'failed')
        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
        AND (e.aggregate_type <> 'internal_note' OR COALESCE(e.payload->>'visibility', '') = 'PUBLIC')
        AND EXISTS (
          SELECT 1
            FROM ward_user_role wur
            JOIN user_account recipient ON recipient.id = wur.user_id
           WHERE wur.ward_id = di.ward_id
             AND wur.user_id = di.recipient_user_id
             AND recipient.is_active = TRUE
             AND wur.revoked_at IS NULL
             AND (wur.expires_at IS NULL OR wur.expires_at > now())
        )
      ORDER BY di.scheduled_for ASC, di.created_at ASC
      FOR UPDATE SKIP LOCKED`,
    [params.wardId, params.recipientUserId, params.frequency]
  );

  const items = digestResult.rows as DigestItemRow[];
  if (items.length === 0) {
    return;
  }

  const userResult = await client.query(
    `SELECT email, is_active
       FROM user_account
      WHERE id = $1::uuid
      LIMIT 1`,
    [params.recipientUserId]
  );
  const recipient = userResult.rows[0] as { email: string | null; is_active: boolean } | undefined;
  const recipientEmail = recipient?.is_active ? (recipient.email ?? null) : null;

  if (!usableEmail(recipientEmail)) {
    const errorMessage = 'Notification digest email skipped because the recipient account has no usable email address.';
    await markDigestDeliveriesFailure(client, {
      wardId: params.wardId,
      digestItemIds: items.map((item) => item.id),
      deliveryIds: items.map((item) => item.delivery_id),
      errorMessage,
      delivered: true,
      leaseToken: null
    });
    return;
  }

  const leaseToken = randomUUID();
  await client.query(
    `UPDATE notification_delivery
        SET delivery_status = 'processing',
            lease_token = $3::uuid,
            processing_started_at = now(),
            attempted_at = now(),
            attempts = attempts + 1,
            next_attempt_at = NULL,
            updated_at = now()
      WHERE ward_id = $1::uuid
        AND id = ANY($2::uuid[])
        AND delivery_status IN ('pending', 'failed')`,
    [params.wardId, items.map((item) => item.delivery_id), leaseToken]
  );
  await client.query('COMMIT');

  try {
    const delivery = await deliverNotificationEmail(
      formatDigestNotificationEmail({
        frequency: params.frequency,
        recipientEmail,
        items: items.map((item) => ({
          title: item.title,
          summary: item.summary,
          targetUrl: item.target_url
        }))
      }),
      { idempotencyKey: `notification-digest:${items.map((item) => item.delivery_id).join(',')}` }
    );

    await client.query('BEGIN');
    await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: params.wardId });
    await client.query(
      `WITH finalized AS (
         UPDATE notification_delivery
            SET delivery_status = 'success',
                lease_token = NULL,
                processing_started_at = NULL,
                external_id = $3::text,
                error_message = NULL,
                attempted_at = now(),
                updated_at = now()
          WHERE ward_id = $1::uuid
            AND id = ANY($2::uuid[])
            AND delivery_status = 'processing'
            AND lease_token = $4::uuid
          RETURNING id
       )
       UPDATE notification_email_digest_item di
          SET delivered_at = now(),
              attempted_at = now(),
              last_error = NULL,
              updated_at = now()
         FROM finalized
        WHERE di.ward_id = $1::uuid
          AND di.id = ANY($5::uuid[])
          AND di.delivery_id = finalized.id
          AND di.delivered_at IS NULL`,
      [params.wardId, items.map((item) => item.delivery_id), delivery.externalId ?? null, leaseToken, items.map((item) => item.id)]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.query('BEGIN');
    await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: params.wardId });
    await markDigestDeliveriesFailure(client, {
      wardId: params.wardId,
      digestItemIds: items.map((item) => item.id),
      deliveryIds: items.map((item) => item.delivery_id),
      errorMessage: error instanceof Error ? error.message : 'Unknown notification digest delivery error',
      delivered: false,
      leaseToken
    });
    await client.query('COMMIT');
    return;
  }
}

async function markDigestDeliveriesFailure(
  client: DbClient,
  params: {
    wardId: string;
    digestItemIds: readonly string[];
    deliveryIds: readonly string[];
    errorMessage: string;
    delivered: boolean;
    leaseToken?: string | null;
  }
): Promise<void> {
  await client.query(
    `WITH finalized AS (
       UPDATE notification_delivery
          SET delivery_status = CASE WHEN $5::boolean THEN 'suppressed' ELSE 'failed' END,
              lease_token = NULL,
              processing_started_at = NULL,
              next_attempt_at = CASE
                WHEN $5::boolean THEN NULL
                ELSE now() + LEAST(3600, GREATEST(10, power(2, attempts - 1) * 5)) * interval '1 second'
              END,
              error_message = $3::text,
              attempted_at = now(),
              updated_at = now()
        WHERE ward_id = $1::uuid
          AND id = ANY($2::uuid[])
          AND ($4::uuid IS NULL OR (delivery_status = 'processing' AND lease_token = $4::uuid))
        RETURNING id
     )
     UPDATE notification_email_digest_item di
        SET attempted_at = now(),
            delivered_at = CASE WHEN $5::boolean THEN now() ELSE di.delivered_at END,
            last_error = $3::text,
            updated_at = now()
       FROM finalized
      WHERE di.ward_id = $1::uuid
        AND di.id = ANY($6::uuid[])
        AND di.delivery_id = finalized.id`,
    [params.wardId, params.deliveryIds, params.errorMessage, params.leaseToken ?? null, params.delivered, params.digestItemIds]
  );
}
