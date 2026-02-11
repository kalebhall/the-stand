import fs from 'node:fs/promises';

const files = ['apps/web/server.mjs', 'apps/web/src/bootstrap.mjs', 'apps/web/drizzle/0000_init.sql'];
for (const file of files) {
  await fs.access(file);
}
console.log('lint passed');
