import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      '@the-stand/shared': path.resolve(import.meta.dirname, '../../packages/shared/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['app/**/*.vitest.ts', 'lib/**/*.vitest.ts', 'src/**/*.vitest.ts']
  }
});
