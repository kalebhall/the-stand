import { createRequire } from 'module';
import { EventEmitter } from 'node:events';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';
import { withDatabaseRecovery } from './recovery';

// pg's named ESM exports for `types` confuse the project tsconfig — use require.
const pgTypes: { setTypeParser: (oid: number, fn: (val: string) => unknown) => void } = createRequire(import.meta.url)('pg').types;

// Return date/timestamp columns as raw strings instead of JS Date objects.
// This prevents silent coercion bugs when string-comparing dates (e.g. YYYY-MM-DD).
// OIDs: 1082 = date, 1114 = timestamp, 1184 = timestamptz
pgTypes.setTypeParser(1082, (val) => val); // date   → 'YYYY-MM-DD'
pgTypes.setTypeParser(1114, (val) => val); // timestamp  → ISO string
pgTypes.setTypeParser(1184, (val) => val); // timestamptz → ISO string with tz offset

let _pool: Pool | undefined;
let _db: NodePgDatabase<typeof schema> | undefined;

function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    _pool = new Pool({
      connectionString,
      // Allow up to 20 concurrent connections.
      // Each request can need 1 client for its lifetime (BEGIN→COMMIT).
      max: 20,
      // Wait up to 15s for a connection before failing.
      // 5s was too short under moderate load bursts.
      connectionTimeoutMillis: 15000,
      // Release idle connections after 60s.
      idleTimeoutMillis: 60000,
      // Never let a broken database connection hold a request forever.
      query_timeout: 10000,
      // Detect dead TCP connections between requests.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });
    const activePool = _pool;
    const poolEvents = activePool as Pool & EventEmitter;
    poolEvents.on('error', (error: Error) => {
      console.error('database_pool_error', { error });
      resetDatabasePool(activePool);
    });
  }
  return _pool;
}

export function resetDatabasePool(poolToClose: Pool | undefined = _pool): void {
  if (!poolToClose || _pool !== poolToClose) return;

  _pool = undefined;
  _db = undefined;
  void poolToClose.end().catch((error: unknown) => {
    console.error('database_pool_close_failed', { error });
  });
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    if (prop === 'connect') {
      return () => withDatabaseRecovery(() => getPool().connect(), resetDatabasePool);
    }
    return Reflect.get(getPool(), prop, receiver);
  }
});

/**
 * Acquire a pool client, run the callback, and guarantee release even on throw.
 * Prefer this over manual pool.connect() + try/finally in every handler.
 *
 * Usage:
 *   const result = await withDbClient(async (client) => {
 *     await client.query('BEGIN');
 *     await setDbContext(client, { userId, wardId });
 *     // ... queries ...
 *     await client.query('COMMIT');
 *     return data;
 *   });
 */
export async function withDbClient<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await withDatabaseRecovery(() => getPool().connect(), resetDatabasePool);
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = drizzle(getPool(), { schema });
    }
    return Reflect.get(_db, prop, receiver);
  }
});
