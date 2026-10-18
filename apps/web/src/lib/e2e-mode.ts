export type E2ETestEnvironment = {
  E2E_TEST_MODE?: string;
  DATABASE_URL?: string;
  TEST_DATABASE_URL?: string;
  [key: string]: string | undefined;
};

export function isIsolatedE2ETestDatabase(env: E2ETestEnvironment = process.env): boolean {
  const testDatabaseUrl = env.TEST_DATABASE_URL;

  return env.E2E_TEST_MODE === '1' && Boolean(testDatabaseUrl?.trim()) && env.DATABASE_URL === testDatabaseUrl;
}
