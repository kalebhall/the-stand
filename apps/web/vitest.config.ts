import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.vitest.ts', 'lib/**/*.vitest.ts', 'src/**/*.vitest.ts']
  }
});
