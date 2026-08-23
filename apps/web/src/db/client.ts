import { createRequire } from 'module';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

// pg's named ESM exports for `types` confuse the project tsconfig — use require.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pgTypes: { setTypeParser: (oid: number, fn: (val: string) => unknown) => void } =
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  createRequire(import.meta.url)('pg').types;

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
      // Fail fast if the pool is exhausted instead of hanging the server
      connectionTimeoutMillis: 5000,
      // Release idle connections after 30s
      idleTimeoutMillis: 30000,
      max: 10
    });
  }
  return _pool;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool(), prop, receiver);
  },
});

export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      if (!_db) {
        _db = drizzle(getPool(), { schema });
      }
      return Reflect.get(_db, prop, receiver);
    },
  },
);
