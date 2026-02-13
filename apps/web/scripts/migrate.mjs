import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const migrationsDir = path.resolve(__dirname, '../drizzle');

async function loadDatabaseUrlFromEnvFile() {
  const envCandidates = [
    process.env.ENV_FILE,
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
  ].filter(Boolean);

  for (const envFilePath of envCandidates) {
    try {
      const envContents = await fs.readFile(envFilePath, 'utf8');
      for (const rawLine of envContents.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }

      if (process.env.DATABASE_URL) {
        return envFilePath;
      }
    } catch {
      // Ignore missing or unreadable env files and try the next location.
    }
  }

  return null;
}

const loadedFromEnvFile = !process.env.DATABASE_URL ? await loadDatabaseUrlFromEnvFile() : null;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required (set it directly or add it to /opt/the-stand/app/.env or <repo>/.env)');
  process.exit(1);
}

if (loadedFromEnvFile) {
  console.log(`Loaded DATABASE_URL from ${loadedFromEnvFile}`);
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  // Create migrations tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Get already-applied migrations
  const { rows: applied } = await client.query(
    'SELECT name FROM _migrations ORDER BY name'
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  // Get migration files sorted alphabetically
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(fullPath, 'utf8');

    console.log(`Applying migration: ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  Applied successfully.`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  Failed to apply migration ${file}:`, err.message);
      process.exit(1);
    }
  }

  if (count === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`Applied ${count} migration(s).`);
  }
} finally {
  await client.end();
}
