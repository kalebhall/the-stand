import fs from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle_migrations (
        id SERIAL PRIMARY KEY,
        file_name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const dir = path.resolve(process.cwd(), 'drizzle');
    const files = (await fs.readdir(dir)).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      const exists = await client.query('SELECT 1 FROM drizzle_migrations WHERE file_name = $1', [file]);
      if (exists.rowCount && exists.rowCount > 0) continue;

      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO drizzle_migrations (file_name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
