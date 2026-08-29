import type { PoolClient } from 'pg';

export const NOTIFICATION_EMAIL_FREQUENCIES = ['IMMEDIATE', 'DAILY', 'WEEKLY'] as const;

export type NotificationEmailFrequency = (typeof NOTIFICATION_EMAIL_FREQUENCIES)[number];
export type NotificationDigestFrequency = Exclude<NotificationEmailFrequency, 'IMMEDIATE'>;

export type NotificationEmailPreference = {
  frequency: NotificationEmailFrequency;
  timezone: string;
};

type DbClient = Pick<PoolClient, 'query'>;

type EmailPreferenceRow = {
  frequency: NotificationEmailFrequency;
  timezone: string;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalDateTimeParts = LocalDateParts & {
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const DEFAULT_NOTIFICATION_EMAIL_FREQUENCY: NotificationEmailFrequency = 'IMMEDIATE';
const DEFAULT_NOTIFICATION_TIMEZONE = 'UTC';
const DIGEST_DELIVERY_HOUR = 8;
const DIGEST_DELIVERY_MINUTE = 0;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateTimeFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  });
  dateTimeFormatterCache.set(timeZone, formatter);
  return formatter;
}

export function isValidIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeNotificationTimeZone(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error('Notification email timezone is required.');
  }
  if (!isValidIanaTimeZone(normalized)) {
    throw new Error(`Invalid notification email timezone: ${normalized}`);
  }
  return normalized;
}

function parseDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = getDateTimeFormatter(timeZone).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const weekday = values.get('weekday');
  const weekdayIndex = weekday ? WEEKDAY_INDEX[weekday] : undefined;

  if (
    !values.get('year') ||
    !values.get('month') ||
    !values.get('day') ||
    !values.get('hour') ||
    !values.get('minute') ||
    !values.get('second') ||
    weekdayIndex === undefined
  ) {
    throw new Error(`Unable to resolve local time parts for timezone ${timeZone}`);
  }

  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
    weekday: weekdayIndex
  };
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const local = parseDateTimeParts(date, timeZone);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return localAsUtc - date.getTime();
}

function zonedDateTimeToUtc(local: LocalDateParts & { hour: number; minute: number; second?: number }, timeZone: string): Date {
  let guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second ?? 0);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offset = getTimeZoneOffsetMilliseconds(new Date(guess), timeZone);
    const nextGuess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second ?? 0) - offset;
    if (nextGuess === guess) break;
    guess = nextGuess;
  }

  return new Date(guess);
}

function addDays(date: LocalDateParts, days: number): LocalDateParts {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function isBeforeDigestTime(local: LocalDateTimeParts): boolean {
  if (local.hour < DIGEST_DELIVERY_HOUR) return true;
  if (local.hour > DIGEST_DELIVERY_HOUR) return false;
  return local.minute < DIGEST_DELIVERY_MINUTE || (local.minute === DIGEST_DELIVERY_MINUTE && local.second === 0);
}

export function getNextDigestDeliveryTime(params: {
  frequency: NotificationDigestFrequency;
  timeZone: string;
  from?: Date;
}): Date {
  const timeZone = normalizeNotificationTimeZone(params.timeZone);
  const from = params.from ?? new Date();
  const localNow = parseDateTimeParts(from, timeZone);

  if (params.frequency === 'DAILY') {
    const localDate = isBeforeDigestTime(localNow)
      ? { year: localNow.year, month: localNow.month, day: localNow.day }
      : addDays(localNow, 1);
    return zonedDateTimeToUtc({ ...localDate, hour: DIGEST_DELIVERY_HOUR, minute: DIGEST_DELIVERY_MINUTE, second: 0 }, timeZone);
  }

  const daysUntilMonday = (8 - localNow.weekday) % 7;
  const targetDate = daysUntilMonday === 0 && isBeforeDigestTime(localNow)
    ? { year: localNow.year, month: localNow.month, day: localNow.day }
    : addDays(localNow, daysUntilMonday === 0 ? 7 : daysUntilMonday);

  return zonedDateTimeToUtc({ ...targetDate, hour: DIGEST_DELIVERY_HOUR, minute: DIGEST_DELIVERY_MINUTE, second: 0 }, timeZone);
}

export async function ensureDefaultNotificationEmailPreference(
  client: DbClient,
  params: { wardId: string; userId: string }
): Promise<void> {
  await client.query(
    `INSERT INTO notification_email_preference (ward_id, user_id, frequency, timezone)
     VALUES ($1::uuid, $2::uuid, $3::text, $4::text)
     ON CONFLICT (ward_id, user_id) DO NOTHING`,
    [params.wardId, params.userId, DEFAULT_NOTIFICATION_EMAIL_FREQUENCY, DEFAULT_NOTIFICATION_TIMEZONE]
  );
}

export async function getNotificationEmailPreference(
  client: DbClient,
  params: { wardId: string; userId: string }
): Promise<NotificationEmailPreference> {
  await ensureDefaultNotificationEmailPreference(client, params);

  const result = await client.query(
    `SELECT frequency, timezone
       FROM notification_email_preference
      WHERE ward_id = $1::uuid
        AND user_id = $2::uuid
      LIMIT 1`,
    [params.wardId, params.userId]
  );

  const row = result.rows[0] as EmailPreferenceRow | undefined;
  if (!row) {
    return { frequency: DEFAULT_NOTIFICATION_EMAIL_FREQUENCY, timezone: DEFAULT_NOTIFICATION_TIMEZONE };
  }

  return {
    frequency: row.frequency,
    timezone: normalizeNotificationTimeZone(row.timezone)
  };
}

export async function getNotificationEmailPreferences(
  client: DbClient,
  params: { wardId: string; userIds: readonly string[] }
): Promise<Map<string, NotificationEmailPreference>> {
  const preferences = new Map<string, NotificationEmailPreference>();
  if (params.userIds.length === 0) {
    return preferences;
  }

  for (const userId of params.userIds) {
    await ensureDefaultNotificationEmailPreference(client, { wardId: params.wardId, userId });
  }

  const result = await client.query(
    `SELECT user_id, frequency, timezone
       FROM notification_email_preference
      WHERE ward_id = $1::uuid
        AND user_id = ANY($2::uuid[])
      ORDER BY user_id`,
    [params.wardId, params.userIds]
  );

  for (const row of result.rows as Array<EmailPreferenceRow & { user_id: string }>) {
    preferences.set(row.user_id, {
      frequency: row.frequency,
      timezone: normalizeNotificationTimeZone(row.timezone)
    });
  }

  return preferences;
}

export async function updateNotificationEmailPreference(
  client: DbClient,
  params: { wardId: string; userId: string; frequency: NotificationEmailFrequency; timezone: string }
): Promise<NotificationEmailPreference> {
  const timezone = normalizeNotificationTimeZone(params.timezone);

  await client.query(
    `INSERT INTO notification_email_preference (ward_id, user_id, frequency, timezone)
     VALUES ($1::uuid, $2::uuid, $3::text, $4::text)
     ON CONFLICT (ward_id, user_id)
     DO UPDATE SET
       frequency = EXCLUDED.frequency,
       timezone = EXCLUDED.timezone,
       updated_at = now()`,
    [params.wardId, params.userId, params.frequency, timezone]
  );

  return { frequency: params.frequency, timezone };
}

export {
  DEFAULT_NOTIFICATION_EMAIL_FREQUENCY,
  DEFAULT_NOTIFICATION_TIMEZONE,
  DIGEST_DELIVERY_HOUR,
  DIGEST_DELIVERY_MINUTE
};
