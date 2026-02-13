import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

let _pool: Pool | undefined;
let _db: NodePgDatabase<typeof schema> | undefined;

function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    _pool = new Pool({ connectionString });
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
