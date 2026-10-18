import { isIsolatedE2ETestDatabase, type E2ETestEnvironment } from '@/src/lib/e2e-mode';

const DEFAULT_CREDENTIAL_RATE_LIMIT_MAX_ATTEMPTS = 10;
const E2E_CREDENTIAL_RATE_LIMIT_MAX_ATTEMPTS = 100;

export function getCredentialRateLimitMaxAttempts(env?: E2ETestEnvironment): number {
  return isIsolatedE2ETestDatabase(env) ? E2E_CREDENTIAL_RATE_LIMIT_MAX_ATTEMPTS : DEFAULT_CREDENTIAL_RATE_LIMIT_MAX_ATTEMPTS;
}
