import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const envTestPath = path.join(repoRoot, '.env.test');
const vitestPath = path.resolve(import.meta.dirname, '../../../node_modules/vitest/vitest.mjs');

function loadEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function runVitest(args, env) {
  const result = spawnSync(process.execPath, [vitestPath, 'run', ...args], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const baseEnv = { ...process.env };
const unitEnv = { ...baseEnv };
delete unitEnv.TEST_DATABASE_URL;
delete unitEnv.DATABASE_URL;

console.log('=== Unit/component suite ===');
const unitStatus = runVitest([], unitEnv);
if (unitStatus !== 0) process.exit(unitStatus);

const testEnv = { ...baseEnv, ...loadEnvFile(envTestPath) };
if (!testEnv.TEST_DATABASE_URL) {
  console.error(`TEST_DATABASE_URL is required for the live database suite: ${envTestPath}`);
  process.exit(1);
}
testEnv.DATABASE_URL = testEnv.TEST_DATABASE_URL;

console.log('=== Applying disposable database migrations ===');
const migration = spawnSync('npm', ['run', 'db:migrate'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: testEnv,
  stdio: 'inherit'
});
if (migration.error) throw migration.error;
if ((migration.status ?? 1) !== 0) process.exit(migration.status ?? 1);

const liveSuites = [
  'src/platform/events/outbox-db.vitest.ts',
  'src/db/document-designer-rls.vitest.ts',
  'src/db/dashboard-layout-rls.vitest.ts',
  'src/db/ward-user-role-rls.vitest.ts',
  'src/db/module-enable-rls.vitest.ts',
  'src/db/p0-rls-isolation.vitest.ts',
  'src/notifications/worker-rls.vitest.ts',
  'src/db/program-publication-schema.vitest.ts'
];

console.log('=== Live PostgreSQL/RLS suite (serialized) ===');
for (const suite of liveSuites) {
  console.log(`--- ${suite} ---`);
  const status = runVitest([suite, '--pool=forks', '--no-file-parallelism', '--maxWorkers=1'], testEnv);
  if (status !== 0) process.exit(status);
}

console.log('All unit, component, migration, and live PostgreSQL/RLS tests passed.');
