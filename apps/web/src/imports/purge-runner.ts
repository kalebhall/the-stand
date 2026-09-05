import { Pool } from 'pg';

import {
  DEFAULT_RAW_PASTE_RETENTION_DAYS,
  normalizeRetentionDays,
  RAW_PASTE_PURGE_SQL,
  PURGED_RAW_TEXT
} from './purge-contract.js';

function getRetentionDays(): number {
  const value = process.env.RAW_PASTE_RETENTION_DAYS;
  if (value === undefined) return DEFAULT_RAW_PASTE_RETENTION_DAYS;

  const retentionDays = Number(value);
  if (!Number.isInteger(retentionDays)) {
    throw new Error('RAW_PASTE_RETENTION_DAYS must be an integer');
  }

  return normalizeRetentionDays(retentionDays);
}

async function main(): Promise<void> {
  const retentionDays = getRetentionDays();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString, max: 1 });
  try {
    const result = await pool.query(RAW_PASTE_PURGE_SQL, [retentionDays, PURGED_RAW_TEXT]);
    console.info('[raw-paste-purge] completed', { purgedCount: result.rowCount ?? 0 });
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  console.error('[raw-paste-purge] failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
}
