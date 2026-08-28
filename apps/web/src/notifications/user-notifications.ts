import type { PoolClient } from 'pg';

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_EVENT_TYPES,
  getNotificationEventDefinition,
  type NotificationCategory,
  type NotificationEventType,
  type NotificationSeverity
} from './events';

type DbClient = Pick<PoolClient, 'query'>;

export type CreateUserNotificationInput = {
  wardId: string;
  recipientUserId: string;
  sourceEventId: string;
  eventType: NotificationEventType;
  aggregateType: string;
  aggregateId: string;
  title: string;
  summary: string;
  details?: unknown;
  severity: NotificationSeverity;
  targetUrl?: string | null;
};

export type UserNotification = {
  id: string;
  wardId: string;
  recipientUserId: string;
  sourceEventId: string;
  eventType: NotificationEventType;
  aggregateType: string;
  aggregateId: string;
  title: string;
  summary: string;
  details: unknown;
  severity: NotificationSeverity;
  targetUrl: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

export type NotificationListFilter = 'all' | 'unread';

export type ListUserNotificationsParams = {
  wardId: string;
  recipientUserId: string;
  filter?: NotificationListFilter;
  category?: NotificationCategory;
  limit?: number;
};

type UserNotificationRow = {
  id: string;
  ward_id: string;
  recipient_user_id: string;
  source_event_id: string;
  event_type: NotificationEventType;
  aggregate_type: string;
  aggregate_id: string;
  title: string;
  summary: string;
  details: unknown;
  severity: NotificationSeverity;
  target_url: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function mapNotificationRow(row: UserNotificationRow): UserNotification {
  return {
    id: row.id,
    wardId: row.ward_id,
    recipientUserId: row.recipient_user_id,
    sourceEventId: row.source_event_id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    title: row.title,
    summary: row.summary,
    details: row.details,
    severity: row.severity,
    targetUrl: row.target_url,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) {
    throw new Error('Notification limit must be a positive integer.');
  }
  return Math.min(limit, MAX_LIMIT);
}

function validateCategory(category: string | undefined): void {
  if (category !== undefined && !NOTIFICATION_CATEGORIES.includes(category as NotificationCategory)) {
    throw new Error(`Invalid notification category: ${category}`);
  }
}

export async function createUserNotification(
  client: DbClient,
  input: CreateUserNotificationInput
): Promise<UserNotification> {
  const insertResult = await client.query(
    `INSERT INTO user_notification (
       ward_id, recipient_user_id, source_event_id, event_type, aggregate_type,
       aggregate_id, title, summary, details, severity, target_url
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::uuid, $7::text, $8::text, $9::jsonb, $10::text, $11::text)
     ON CONFLICT (recipient_user_id, source_event_id) DO NOTHING
     RETURNING id, ward_id, recipient_user_id, source_event_id, event_type, aggregate_type,
       aggregate_id, title, summary, details, severity, target_url, read_at, dismissed_at, created_at`,
    [
      input.wardId,
      input.recipientUserId,
      input.sourceEventId,
      input.eventType,
      input.aggregateType,
      input.aggregateId,
      input.title,
      input.summary,
      input.details === undefined ? null : JSON.stringify(input.details),
      input.severity,
      input.targetUrl ?? null
    ]
  );

  if (insertResult.rows.length > 0) {
    return mapNotificationRow(insertResult.rows[0] as UserNotificationRow);
  }

  const existingResult = await client.query(
    `SELECT id, ward_id, recipient_user_id, source_event_id, event_type, aggregate_type,
       aggregate_id, title, summary, details, severity, target_url, read_at, dismissed_at, created_at
       FROM user_notification
      WHERE ward_id = $1::uuid
        AND recipient_user_id = $2::uuid
        AND source_event_id = $3::uuid
      LIMIT 1`,
    [input.wardId, input.recipientUserId, input.sourceEventId]
  );

  if (existingResult.rows.length === 0) {
    throw new Error('User notification could not be created or loaded after duplicate detection.');
  }

  return mapNotificationRow(existingResult.rows[0] as UserNotificationRow);
}

export async function listUserNotifications(
  client: DbClient,
  params: ListUserNotificationsParams
): Promise<UserNotification[]> {
  const limit = normalizeLimit(params.limit);
  validateCategory(params.category);
  const values: unknown[] = [params.wardId, params.recipientUserId];
  const conditions = ['ward_id = $1::uuid', 'recipient_user_id = $2::uuid', 'dismissed_at IS NULL'];

  if (params.filter === 'unread') {
    conditions.push('read_at IS NULL');
  } else if (params.filter !== undefined && params.filter !== 'all') {
    throw new Error(`Invalid notification filter: ${params.filter}`);
  }

  if (params.category !== undefined) {
    const categoryEventTypes = NOTIFICATION_EVENT_TYPES.filter(
      (eventType) => getNotificationEventDefinition(eventType).category === params.category
    );
    if (categoryEventTypes.length === 0) {
      return [];
    }
    const placeholders = categoryEventTypes.map((eventType) => {
      values.push(eventType);
      return `$${values.length}::text`;
    });
    conditions.push(`event_type IN (${placeholders.join(', ')})`);
  }

  values.push(limit);
  const result = await client.query(
    `SELECT id, ward_id, recipient_user_id, source_event_id, event_type, aggregate_type,
       aggregate_id, title, summary, details, severity, target_url, read_at, dismissed_at, created_at
       FROM user_notification
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY created_at DESC
      LIMIT $${values.length}::int`,
    values
  );

  return (result.rows as UserNotificationRow[]).map(mapNotificationRow);
}

export async function countUnreadUserNotifications(
  client: DbClient,
  params: { wardId: string; recipientUserId: string }
): Promise<number> {
  const result = await client.query(
    `SELECT count(*) AS count
       FROM user_notification
      WHERE ward_id = $1::uuid
        AND recipient_user_id = $2::uuid
        AND read_at IS NULL
        AND dismissed_at IS NULL`,
    [params.wardId, params.recipientUserId]
  );

  return Number((result.rows[0] as { count: string }).count);
}

export async function markUserNotificationRead(
  client: DbClient,
  params: { wardId: string; recipientUserId: string; notificationId: string }
): Promise<boolean> {
  const result = await client.query(
    `UPDATE user_notification
        SET read_at = COALESCE(read_at, now())
      WHERE id = $1::uuid
        AND ward_id = $2::uuid
        AND recipient_user_id = $3::uuid
        AND dismissed_at IS NULL`,
    [params.notificationId, params.wardId, params.recipientUserId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function dismissUserNotification(
  client: DbClient,
  params: { wardId: string; recipientUserId: string; notificationId: string }
): Promise<boolean> {
  const result = await client.query(
    `UPDATE user_notification
        SET dismissed_at = COALESCE(dismissed_at, now()),
            read_at = COALESCE(read_at, now())
      WHERE id = $1::uuid
        AND ward_id = $2::uuid
        AND recipient_user_id = $3::uuid`,
    [params.notificationId, params.wardId, params.recipientUserId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function markAllUserNotificationsRead(
  client: DbClient,
  params: { wardId: string; recipientUserId: string }
): Promise<number> {
  const result = await client.query(
    `UPDATE user_notification
        SET read_at = now()
      WHERE ward_id = $1::uuid
        AND recipient_user_id = $2::uuid
        AND read_at IS NULL
        AND dismissed_at IS NULL`,
    [params.wardId, params.recipientUserId]
  );

  return result.rowCount ?? 0;
}

export { DEFAULT_LIMIT, MAX_LIMIT, normalizeLimit };
