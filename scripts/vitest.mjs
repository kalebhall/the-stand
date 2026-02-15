import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';

const healthRoute = await fs.readFile('apps/web/app/health/route.ts', 'utf8');
assert.match(healthRoute, /status:\s*'ok'/, 'health route must return status ok');

const routeFiles = [
  'apps/web/app/page.tsx',
  'apps/web/app/login/page.tsx',
  'apps/web/app/request-access/page.tsx',
  'apps/web/app/logout/page.tsx',
  'apps/web/app/dashboard/page.tsx'
];

for (const file of routeFiles) {
  await fs.access(file);
}

console.log('file existence checks: passed');

try {
  execSync('npm --workspace @the-stand/web run test', { stdio: 'inherit' });
  console.log('vitest unit tests: passed');
} catch (error) {
  console.error('vitest unit tests: failed');
  process.exit(1);
}
