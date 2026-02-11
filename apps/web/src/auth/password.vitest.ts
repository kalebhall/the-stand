import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes and verifies with argon2id', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'incorrect')).resolves.toBe(false);
  });
});
