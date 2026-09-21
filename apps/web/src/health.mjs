import pg from 'pg';

import { APP_VERSION } from './version.mjs';

let healthPool;

function getHealthPool() {
  if (!healthPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    healthPool = new pg.Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 2_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5_000
    });
    healthPool.on('error', (error) => {
      console.error('health_database_pool_error', { error: error instanceof Error ? error.message : 'unknown error' });
      healthPool = undefined;
    });
  }
  return healthPool;
}

async function probeDatabase() {
  await getHealthPool().query('SELECT 1');
}

export async function runHealthCheck(probe = probeDatabase) {
  try {
    await probe();
    return { status: 'ok', db: 'connected', version: APP_VERSION };
  } catch (error) {
    console.error('health_check_failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return { status: 'degraded', db: 'disconnected', version: APP_VERSION };
  }
}
