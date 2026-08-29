import type { PoolClient } from 'pg';

import { deliverNotificationEmail, formatDigestNotificationEmail, usableEmail } from './email';
import {
  getNextDigestDeliveryTime,
  type NotificationDigestFrequency,
  type NotificationEmailPreference
} from './email-preferences';

type DbClient = Pick<PoolClient, 'query'>;

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

export async function queueNotificationDigest(
  client: DbClient,
  params: QueueNotificationDigestParams
): Promise<NotificationDigestJob> {
  const scheduledFor = getNextDigestDeliveryTime({
    frequency: params.preference.frequency,
    timeZone: params.preference.timezone
  });

  const deliveryResult = await client.query(
    `INSERT INTO notification_delivery (ward_id, event_outbox_id, recipient_user_id, channel, delivery_status, attempted_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'EMAIL', 'pending', NULL)
     ON CONFLICT (event_outbox_id, channel, recipient_user_id)
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
  const digestResult = await client.query(
    `SELECT id, delivery_id, title, summary, target_url, scheduled_for
       FROM notification_email_digest_item
      WHERE ward_id = $1::uuid
        AND recipient_user_id = $2::uuid
        AND digest_frequency = $3::text
        AND delivered_at IS NULL
        AND scheduled_for <= now()
      ORDER BY scheduled_for ASC, created_at ASC
      FOR UPDATE SKIP LOCKED`,
    [params.wardId, params.recipientUserId, params.frequency]
  );

  const items = digestResult.rows as DigestItemRow[];
  if (items.length === 0) {
    return;
  }

  const userResult = await client.query(
    `SELECT email
       FROM user_account
      WHERE id = $1::uuid
      LIMIT 1`,
    [params.recipientUserId]
  );
  const recipientEmail = (userResult.rows[0] as { email: string | null } | undefined)?.email ?? null;

  if (!usableEmail(recipientEmail)) {
    const errorMessage = 'Notification digest email skipped because the recipient account has no usable email address.';
    await markDigestDeliveriesFailure(client, {
      wardId: params.wardId,
      digestItemIds: items.map((item) => item.id),
      deliveryIds: items.map((item) => item.delivery_id),
      errorMessage,
      delivered: true
    });
    return;
  }

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
      })
    );

    await client.query(
      `UPDATE notification_delivery
          SET delivery_status = 'success',
              external_id = $3::text,
              error_message = NULL,
              attempted_at = now(),
              updated_at = now()
        WHERE ward_id = $1::uuid
          AND id = ANY($2::uuid[])`,
      [params.wardId, items.map((item) => item.delivery_id), delivery.externalId ?? null]
    );

    await client.query(
      `UPDATE notification_email_digest_item
          SET delivered_at = now(),
              attempted_at = now(),
              last_error = NULL,
              updated_at = now()
        WHERE ward_id = $1::uuid
          AND id = ANY($2::uuid[])`,
      [params.wardId, items.map((item) => item.id)]
    );
  } catch (error) {
    await markDigestDeliveriesFailure(client, {
      wardId: params.wardId,
      digestItemIds: items.map((item) => item.id),
      deliveryIds: items.map((item) => item.delivery_id),
      errorMessage: error instanceof Error ? error.message : 'Unknown notification digest delivery error',
      delivered: false
    });
    throw error;
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
  }
): Promise<void> {
  await client.query(
    `UPDATE notification_delivery
        SET delivery_status = 'failure',
            error_message = $3::text,
            attempted_at = now(),
            updated_at = now()
      WHERE ward_id = $1::uuid
        AND id = ANY($2::uuid[])`,
    [params.wardId, params.deliveryIds, params.errorMessage]
  );

  await client.query(
    `UPDATE notification_email_digest_item
        SET attempted_at = now(),
            delivered_at = CASE WHEN $3::boolean THEN now() ELSE delivered_at END,
            last_error = $4::text,
            updated_at = now()
      WHERE ward_id = $1::uuid
        AND id = ANY($2::uuid[])`,
    [params.wardId, params.digestItemIds, params.delivered, params.errorMessage]
  );
}
