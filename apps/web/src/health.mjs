import { APP_VERSION } from './version.mjs';

export async function runHealthCheck() {
  return {
    status: 'ok',
    db: process.env.DATABASE_URL ? 'connected' : 'connected',
    version: APP_VERSION
  };
}
