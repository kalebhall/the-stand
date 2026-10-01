import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3005',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'set -a; [ ! -f ../../.env.test ] || . ../../.env.test; set +a; E2E_FIXTURES_ALLOWED=1 npm run e2e:fixtures && E2E_TEST_MODE=1 AUTH_SECRET=e2e-test-secret-change-me SUPPORT_ADMIN_EMAIL=support-admin@example.test SUPPORT_ADMIN_INITIAL_PASSWORD=BootstrapPassword123456789012 npm run dev -- --port 3005',
    port: 3005,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
