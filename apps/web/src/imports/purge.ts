import { pool } from '@/src/db/client';

import {
  DEFAULT_RAW_PASTE_RETENTION_DAYS,
  normalizeRetentionDays,
  PURGED_RAW_TEXT,
  RAW_PASTE_PURGE_SQL
} from './purge-contract.js';

export {
  DEFAULT_RAW_PASTE_RETENTION_DAYS,
  normalizeRetentionDays,
  PURGED_RAW_TEXT,
  RAW_PASTE_PURGE_SQL
} from './purge-contract.js';

export async function purgeRawPasteData(retentionDays: number = DEFAULT_RAW_PASTE_RETENTION_DAYS): Promise<number> {
  const normalizedRetentionDays = normalizeRetentionDays(retentionDays);
  const client = await pool.connect();

  try {
    const result = await client.query(RAW_PASTE_PURGE_SQL, [normalizedRetentionDays, PURGED_RAW_TEXT]);
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}
