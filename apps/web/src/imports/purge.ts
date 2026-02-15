import { pool } from '@/src/db/client';

const DEFAULT_RETENTION_DAYS = 30;

export async function purgeRawPasteData(retentionDays: number = DEFAULT_RETENTION_DAYS): Promise<number> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE import_run
          SET raw_text = '[purged]'
        WHERE raw_text != '[purged]'
          AND created_at < now() - ($1 || ' days')::interval
        RETURNING id`,
      [retentionDays]
    );

    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}
