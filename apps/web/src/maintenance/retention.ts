import { pool } from '@/src/db/client';

import {
  AUDIT_LOG_PURGE_COUNT_SQL,
  AUDIT_LOG_PURGE_SQL,
  DEFAULT_AUDIT_LOG_RETENTION_DAYS,
  DEFAULT_RAW_PASTE_RETENTION_DAYS,
  PURGED_RAW_TEXT,
  RAW_PASTE_PURGE_COUNT_SQL,
  RAW_PASTE_PURGE_SQL,
  normalizeAuditLogRetentionDays,
  normalizeRawPasteRetentionDays
} from './retention-contract.js';

export async function purgeOperationalData(options: {
  rawPasteRetentionDays?: number;
  auditLogRetentionDays?: number;
  dryRun?: boolean;
} = {}): Promise<{ rawPasteCount: number; auditLogCount: number; dryRun: boolean }> {
  const rawPasteRetentionDays = normalizeRawPasteRetentionDays(
    options.rawPasteRetentionDays ?? DEFAULT_RAW_PASTE_RETENTION_DAYS
  );
  const auditLogRetentionDays = normalizeAuditLogRetentionDays(
    options.auditLogRetentionDays ?? DEFAULT_AUDIT_LOG_RETENTION_DAYS
  );
  const dryRun = options.dryRun ?? false;
  const client = await pool.connect();

  try {
    if (dryRun) {
      const [rawPasteResult, auditLogResult] = await Promise.all([
        client.query(RAW_PASTE_PURGE_COUNT_SQL, [rawPasteRetentionDays, PURGED_RAW_TEXT]),
        client.query(AUDIT_LOG_PURGE_COUNT_SQL, [auditLogRetentionDays])
      ]);
      return {
        rawPasteCount: Number(rawPasteResult.rows[0]?.count ?? 0),
        auditLogCount: Number(auditLogResult.rows[0]?.count ?? 0),
        dryRun
      };
    }

    await client.query('BEGIN');
    const rawPasteResult = await client.query(RAW_PASTE_PURGE_SQL, [rawPasteRetentionDays, PURGED_RAW_TEXT]);
    const auditLogResult = await client.query(AUDIT_LOG_PURGE_SQL, [auditLogRetentionDays]);
    await client.query('COMMIT');
    return {
      rawPasteCount: rawPasteResult.rowCount ?? 0,
      auditLogCount: auditLogResult.rowCount ?? 0,
      dryRun
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
