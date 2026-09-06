import { describe, expect, it } from 'vitest';

import { getSafeSession } from './safe-session';

describe('getSafeSession', () => {
  it('returns null when session loading throws', async () => {
    await expect(getSafeSession(async () => {
      throw new Error('invalid session token');
    })).resolves.toBeNull();
  });
});
