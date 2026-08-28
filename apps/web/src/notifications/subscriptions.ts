import type { PoolClient } from 'pg';

import {
  NOTIFICATION_EVENT_TYPES,
  getNotificationEventDefinition,
  type NotificationChannel,
  type NotificationCategory,
  type NotificationEventType
} from './events';

type DbClient = Pick<PoolClient, 'query'>;

export type SubscriptionUpdate = {
  eventType: NotificationEventType;
  channel: NotificationChannel;
  enabled: boolean;
};

export type NotificationSubscriptionPreference = {
  eventType: NotificationEventType;
  category: NotificationCategory;
  label: string;
  channels: Record<NotificationChannel, boolean>;
};

type SubscriptionRow = {
  event_type: NotificationEventType;
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
};

const CHANNELS: readonly NotificationChannel[] = ['IN_APP', 'EMAIL'];

function validateSubscriptionUpdate(update: SubscriptionUpdate): void {
  const definition = getDefinition(update.eventType);

  if (!CHANNELS.includes(update.channel)) {
    throw new Error(`Invalid notification channel: ${update.channel}`);
  }

  if (typeof update.enabled !== 'boolean') {
    throw new Error(`Invalid enabled value for ${update.eventType}/${update.channel}`);
  }

  if (definition.eventType !== update.eventType) {
    throw new Error(`Unknown notification event type: ${update.eventType}`);
  }
}

function getDefinition(eventType: string) {
  return getNotificationEventDefinition(eventType);
}

function buildDefaultRows(): Array<{
  eventType: NotificationEventType;
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}> {
  return NOTIFICATION_EVENT_TYPES.flatMap((eventType) => {
    const definition = getDefinition(eventType);
    return CHANNELS.map((channel) => ({
      eventType,
      category: definition.category,
      channel,
      enabled: definition.defaultChannels.includes(channel)
    }));
  });
}

export async function ensureDefaultNotificationSubscriptions(
  client: DbClient,
  params: { wardId: string; userId: string }
): Promise<void> {
  const defaults = buildDefaultRows();
  const values: unknown[] = [params.wardId, params.userId];
  const rows = defaults.map((row, index) => {
    const offset = index * 4;
    values.push(row.category, row.eventType, row.channel, row.enabled);
    return `($1::uuid, $2::uuid, $${offset + 3}::text, $${offset + 4}::text, $${offset + 5}::text, $${offset + 6}::boolean)`;
  });

  await client.query(
    `INSERT INTO notification_subscription
       (ward_id, user_id, category, event_type, channel, enabled)
     VALUES ${rows.join(', ')}
     ON CONFLICT (ward_id, user_id, event_type, channel) DO NOTHING`,
    values
  );
}

export async function getNotificationSubscriptions(
  client: DbClient,
  params: { wardId: string; userId: string }
): Promise<NotificationSubscriptionPreference[]> {
  await ensureDefaultNotificationSubscriptions(client, params);

  const result = await client.query(
    `SELECT event_type, category, channel, enabled
       FROM notification_subscription
      WHERE ward_id = $1::uuid
        AND user_id = $2::uuid
      ORDER BY category, event_type, channel`,
    [params.wardId, params.userId]
  );

  const preferences = new Map<NotificationEventType, NotificationSubscriptionPreference>();
  for (const row of result.rows as SubscriptionRow[]) {
    let preference = preferences.get(row.event_type);
    if (!preference) {
      preference = {
        eventType: row.event_type,
        category: row.category,
        label: getDefinition(row.event_type).label,
        channels: { IN_APP: false, EMAIL: false }
      };
      preferences.set(row.event_type, preference);
    }
    preference.channels[row.channel] = row.enabled;
  }

  return NOTIFICATION_EVENT_TYPES
    .map((eventType) => preferences.get(eventType))
    .filter((preference): preference is NotificationSubscriptionPreference => preference !== undefined);
}

export async function updateNotificationSubscriptions(
  client: DbClient,
  params: { wardId: string; userId: string; updates: SubscriptionUpdate[] }
): Promise<NotificationSubscriptionPreference[]> {
  if (params.updates.length === 0) {
    throw new Error('At least one notification subscription update is required.');
  }

  const seen = new Set<string>();
  for (const update of params.updates) {
    validateSubscriptionUpdate(update);
    const key = `${update.eventType}:${update.channel}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate notification subscription update: ${key}`);
    }
    seen.add(key);
  }

  const values: unknown[] = [params.wardId, params.userId];
  const rows = params.updates.map((update, index) => {
    const definition = getDefinition(update.eventType);
    const offset = index * 4;
    values.push(definition.category, update.eventType, update.channel, update.enabled);
    return `($1::uuid, $2::uuid, $${offset + 3}::text, $${offset + 4}::text, $${offset + 5}::text, $${offset + 6}::boolean)`;
  });

  await client.query(
    `INSERT INTO notification_subscription
       (ward_id, user_id, category, event_type, channel, enabled)
     VALUES ${rows.join(', ')}
     ON CONFLICT (ward_id, user_id, event_type, channel)
     DO UPDATE SET
       category = EXCLUDED.category,
       enabled = EXCLUDED.enabled,
       updated_at = now()`,
    values
  );

  return getNotificationSubscriptions(client, params);
}

export { buildDefaultRows };
