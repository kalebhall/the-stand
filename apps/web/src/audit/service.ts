import type { PoolClient } from 'pg';

export type AuditSource = 'manual_ui' | 'lcr_import' | 'bulk_sync' | 'api';
export type AuditSeverity = 'info' | 'notice' | 'security';
export type AuditEntityType =
  | 'calling'
  | 'program_item'
  | 'meeting'
  | 'member'
  | 'announcement'
  | 'ward_setting'
  | 'user'
  | 'support_grant'
  | 'import'
  | string;

export type AuditEventParams = {
  wardId?: string | null;
  userId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  targetMemberId?: string | null;
  targetMemberName?: string | null;
  entityType?: AuditEntityType | null;
  entityId?: string | null;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  previousState?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  source?: AuditSource;
  severity?: AuditSeverity;
  isCrossWardSupport?: boolean;
  callingName?: string | null;
  organization?: string | null;
  callingStatus?: string | null;
  effectiveDate?: string | null;
  meetingDate?: string | null;
  itemType?: string | null;
  itemTitle?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
};

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'secret',
  'clientsecret',
  'client_secret',
  'apikey',
  'api_key',
  'authorization',
  'privatekey',
  'private_key',
  'recoverykey',
  'recovery_key',
  'sessionsecret',
  'session_secret'
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

export function redactSensitiveData<T>(data: T): T {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

export function buildFieldDiff(
  oldRecord: Record<string, unknown> | null | undefined,
  newRecord: Record<string, unknown> | null | undefined,
  ignoredKeys: string[] = ['updatedAt', 'updated_at', 'createdAt', 'created_at']
): Record<string, { old: unknown; new: unknown }> | null {
  if (!oldRecord && !newRecord) return null;

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const ignored = new Set(ignoredKeys.map((k) => k.toLowerCase()));

  const allKeys = new Set([
    ...Object.keys(oldRecord || {}),
    ...Object.keys(newRecord || {})
  ]);

  for (const key of allKeys) {
    if (ignored.has(key.toLowerCase())) continue;
    if (isSensitiveKey(key)) continue;

    const oldVal = oldRecord ? oldRecord[key] : undefined;
    const newVal = newRecord ? newRecord[key] : undefined;

    const oldSerialized = JSON.stringify(oldVal);
    const newSerialized = JSON.stringify(newVal);

    if (oldSerialized !== newSerialized) {
      diff[key] = {
        old: oldVal === undefined ? null : oldVal,
        new: newVal === undefined ? null : newVal
      };
    }
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

export async function recordAuditEvent(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  event: AuditEventParams
): Promise<void> {
  const safeDetails = event.details ? redactSensitiveData(event.details) : null;
  const safeChanges = event.changes ? redactSensitiveData(event.changes) : null;
  const safePreviousState = event.previousState ? redactSensitiveData(event.previousState) : null;

  await client.query(
    `INSERT INTO audit_log (
       ward_id,
       user_id,
       actor_name,
       actor_role,
       action,
       target_member_id,
       target_member_name,
       entity_type,
       entity_id,
       changes,
       previous_state,
       details,
       source,
       severity,
       is_cross_ward_support,
       calling_name,
       organization,
       calling_status,
       effective_date,
       meeting_date,
       item_type,
       item_title,
       ip_address,
       user_agent,
       session_id
     ) VALUES (
       $1::uuid,
       $2::uuid,
       $3::text,
       $4::text,
       $5::text,
       $6::uuid,
       $7::text,
       $8::text,
       $9::text,
       $10::jsonb,
       $11::jsonb,
       $12::jsonb,
       $13::text,
       $14::text,
       $15::boolean,
       $16::text,
       $17::text,
       $18::text,
       $19::date,
       $20::date,
       $21::text,
       $22::text,
       $23::text,
       $24::text,
       $25::text
     )`,
    [
      event.wardId || null,
      event.userId || null,
      event.actorName || null,
      event.actorRole || null,
      event.action,
      event.targetMemberId || null,
      event.targetMemberName || null,
      event.entityType || null,
      event.entityId || null,
      safeChanges ? JSON.stringify(safeChanges) : null,
      safePreviousState ? JSON.stringify(safePreviousState) : null,
      safeDetails ? JSON.stringify(safeDetails) : null,
      event.source || 'manual_ui',
      event.severity || 'info',
      event.isCrossWardSupport || false,
      event.callingName || null,
      event.organization || null,
      event.callingStatus || null,
      event.effectiveDate || null,
      event.meetingDate || null,
      event.itemType || null,
      event.itemTitle || null,
      event.ipAddress || null,
      event.userAgent || null,
      event.sessionId || null
    ]
  );
}
