import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3005',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'E2E_TEST_MODE=1 AUTH_SECRET=e2e-test-secret-change-me SUPPORT_ADMIN_EMAIL=support-admin@example.test SUPPORT_ADMIN_INITIAL_PASSWORD=BootstrapPassword123456789012 npm run dev -- --port 3005',
    port: 3005,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
