import test from 'node:test';
import assert from 'node:assert/strict';

import { runHealthCheck } from './apps/web/src/health.mjs';

test('health reports connected when the database probe succeeds', async () => {
  const value = await runHealthCheck(async () => undefined);
  assert.deepEqual(value.status, 'ok');
  assert.equal(value.db, 'connected');
});

test('health reports degraded when the database probe fails', async () => {
  const value = await runHealthCheck(async () => {
    throw new Error('database unavailable');
  });
  assert.equal(value.status, 'degraded');
  assert.equal(value.db, 'disconnected');
});
