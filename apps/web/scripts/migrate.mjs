import fs from 'node:fs/promises';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const migrationsDir = path.resolve(__dirname, '../drizzle');
const stateFile = path.resolve(__dirname, '../.migrations-applied.json');

const existing = await fs
  .readFile(stateFile, 'utf8')
  .then((v) => JSON.parse(v))
  .catch(() => []);

const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

const next = [...existing];
for (const file of files) {
  if (existing.includes(file)) continue;
  const fullPath = path.join(migrationsDir, file);
  await fs.access(fullPath);
  next.push(file);
  console.log(`Marked migration as applied: ${file}`);
}

await fs.writeFile(stateFile, `${JSON.stringify(next, null, 2)}\n`);
console.log('Migration runner completed.');
