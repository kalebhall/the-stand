import { describe, expect, it } from 'vitest';

import { getCredentialRateLimitMaxAttempts } from './credential-rate-limit';

describe('credential rate-limit configuration', () => {
  it('raises the limit only for explicit E2E runs against the exact test database', () => {
    expect(
      getCredentialRateLimitMaxAttempts({
        E2E_TEST_MODE: '1',
        DATABASE_URL: 'postgres://test-db',
        TEST_DATABASE_URL: 'postgres://test-db'
      })
    ).toBe(100);
  });

  it('keeps the production limit unless the E2E flag is exactly one', () => {
    expect(
      getCredentialRateLimitMaxAttempts({
        E2E_TEST_MODE: 'true',
        DATABASE_URL: 'postgres://test-db',
        TEST_DATABASE_URL: 'postgres://test-db'
      })
    ).toBe(10);
  });

  it('keeps the production limit when DATABASE_URL is missing', () => {
    expect(
      getCredentialRateLimitMaxAttempts({
        E2E_TEST_MODE: '1',
        TEST_DATABASE_URL: 'postgres://test-db'
      })
    ).toBe(10);
  });

  it('keeps the production limit when TEST_DATABASE_URL is blank', () => {
    for (const databaseUrl of ['', '   ']) {
      expect(
        getCredentialRateLimitMaxAttempts({
          E2E_TEST_MODE: '1',
          DATABASE_URL: databaseUrl,
          TEST_DATABASE_URL: databaseUrl
        })
      ).toBe(10);
    }
  });

  it('keeps the production limit when the E2E flag is absent', () => {
    expect(
      getCredentialRateLimitMaxAttempts({
        DATABASE_URL: 'postgres://test-db',
        TEST_DATABASE_URL: 'postgres://test-db'
      })
    ).toBe(10);
  });

  it('keeps the production limit when the database identities do not match', () => {
    expect(
      getCredentialRateLimitMaxAttempts({
        E2E_TEST_MODE: '1',
        DATABASE_URL: 'postgres://production-db',
        TEST_DATABASE_URL: 'postgres://test-db'
      })
    ).toBe(10);
  });

  it('keeps the production limit when the test database is not configured', () => {
    expect(
      getCredentialRateLimitMaxAttempts({
        E2E_TEST_MODE: '1',
        DATABASE_URL: 'postgres://test-db'
      })
    ).toBe(10);
  });
});
