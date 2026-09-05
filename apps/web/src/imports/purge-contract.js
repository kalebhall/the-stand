export const DEFAULT_RAW_PASTE_RETENTION_DAYS = 30;
export const PURGED_RAW_TEXT = '[purged]';

export function normalizeRetentionDays(retentionDays) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error('retentionDays must be an integer between 1 and 3650');
  }

  return retentionDays;
}

export const RAW_PASTE_PURGE_SQL = `UPDATE import_run
    SET raw_text = $2::text
  WHERE raw_text != $2::text
    AND created_at < now() - ($1::int * interval '1 day')
  RETURNING id`;
