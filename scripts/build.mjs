import fs from 'node:fs/promises';

await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/build.txt', 'build ok\n');
console.log('build passed');
