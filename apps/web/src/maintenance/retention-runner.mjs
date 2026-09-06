import { Pool } from 'pg';

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

function readDays(name, defaultValue, normalize) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const days = Number(value);
  if (!Number.isInteger(days)) throw new Error(`${name} must be an integer`);
  return normalize(days);
}

function isDryRun() {
  return process.env.RETENTION_DRY_RUN === '1';
}

async function main() {
  const rawPasteRetentionDays = readDays(
    'RAW_PASTE_RETENTION_DAYS',
    DEFAULT_RAW_PASTE_RETENTION_DAYS,
    normalizeRawPasteRetentionDays
  );
  const auditLogRetentionDays = readDays(
    'AUDIT_LOG_RETENTION_DAYS',
    DEFAULT_AUDIT_LOG_RETENTION_DAYS,
    normalizeAuditLogRetentionDays
  );
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    if (isDryRun()) {
      const [rawPasteResult, auditLogResult] = await Promise.all([
        client.query(RAW_PASTE_PURGE_COUNT_SQL, [rawPasteRetentionDays, PURGED_RAW_TEXT]),
        client.query(AUDIT_LOG_PURGE_COUNT_SQL, [auditLogRetentionDays])
      ]);
      console.info('[retention-purge] dry-run', {
        rawPasteCount: Number(rawPasteResult.rows[0]?.count ?? 0),
        auditLogCount: Number(auditLogResult.rows[0]?.count ?? 0)
      });
      return;
    }

    await client.query('BEGIN');
    try {
      const rawPasteResult = await client.query(RAW_PASTE_PURGE_SQL, [rawPasteRetentionDays, PURGED_RAW_TEXT]);
      const auditLogResult = await client.query(AUDIT_LOG_PURGE_SQL, [auditLogRetentionDays]);
      await client.query('COMMIT');
      console.info('[retention-purge] completed', {
        rawPasteCount: rawPasteResult.rowCount ?? 0,
        auditLogCount: auditLogResult.rowCount ?? 0
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  console.error('[retention-purge] failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
}
