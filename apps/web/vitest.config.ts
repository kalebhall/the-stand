import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic'
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      '@the-stand/shared': path.resolve(import.meta.dirname, '../../packages/shared/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['app/**/*.vitest.{ts,tsx}', 'components/**/*.vitest.{ts,tsx}', 'lib/**/*.vitest.{ts,tsx}', 'src/**/*.vitest.{ts,tsx}']
  }
});
