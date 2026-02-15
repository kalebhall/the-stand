import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';

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

console.log('file existence checks: passed');

try {
  execSync('npm --workspace @the-stand/web run build', { stdio: 'inherit' });
  console.log('next build: passed');
} catch (error) {
  console.error('next build: failed');
  process.exit(1);
}
