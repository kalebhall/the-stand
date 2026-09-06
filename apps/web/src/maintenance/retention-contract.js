export const DEFAULT_RAW_PASTE_RETENTION_DAYS = 30;
export const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 2555;
export const PURGED_RAW_TEXT = '[purged]';

export function normalizeRawPasteRetentionDays(value) {
  return normalizeDays(value, 'raw paste retention', 1, 3650);
}

export function normalizeAuditLogRetentionDays(value) {
  return normalizeDays(value, 'audit log retention', 365, 3650);
}

function normalizeDays(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export const RAW_PASTE_PURGE_SQL = `UPDATE import_run
    SET raw_text = $2::text
  WHERE raw_text != $2::text
    AND created_at < now() - ($1::int * interval '1 day')
  RETURNING id`;

export const AUDIT_LOG_PURGE_SQL = `DELETE FROM audit_log
  WHERE created_at < now() - ($1::int * interval '1 day')
  RETURNING id`;

export const RAW_PASTE_PURGE_COUNT_SQL = `SELECT count(*)::int AS count
  FROM import_run
 WHERE raw_text != $2::text
   AND created_at < now() - ($1::int * interval '1 day')`;

export const AUDIT_LOG_PURGE_COUNT_SQL = `SELECT count(*)::int AS count
  FROM audit_log
 WHERE created_at < now() - ($1::int * interval '1 day')`;
