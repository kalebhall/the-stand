import test from 'node:test';
import assert from 'node:assert/strict';

import { runHealthCheck } from './apps/web/src/health.mjs';

test('health endpoint contract', async () => {
  const value = await runHealthCheck();
  assert.equal(value.status, 'ok');
  assert.equal(value.db, 'connected');
});
