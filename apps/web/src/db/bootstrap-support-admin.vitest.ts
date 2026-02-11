import { describe, expect, it } from 'vitest';

import { generateBootstrapPassword } from './bootstrap-support-admin';

describe('support admin bootstrap password', () => {
  it('generates a cryptographically random password with at least 24 chars', () => {
    const password = generateBootstrapPassword();

    expect(password.length).toBeGreaterThanOrEqual(24);
  });
});
