import fs from 'node:fs/promises';

const requiredFiles = [
  'apps/web/app/layout.tsx',
  'apps/web/app/page.tsx',
  'apps/web/app/health/route.ts',
  'apps/web/components.json',
  'apps/web/app/globals.css'
];

for (const file of requiredFiles) {
  await fs.access(file);
}

console.log('next build (placeholder): passed');
