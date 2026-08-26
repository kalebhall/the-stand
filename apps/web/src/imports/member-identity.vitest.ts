import { describe, expect, it } from 'vitest';

import { makeMemberIdentityKey } from './member-identity';

describe('member identity keys', () => {
  const secret = 'test-member-identity-secret-32-characters';

  it('recreates same key for equivalent names and dates', () => {
    const first = makeMemberIdentityKey({ fullName: ' Doe, Jane ', birthday: '15 January 1991', secret });
    const second = makeMemberIdentityKey({ fullName: 'doe, jane', birthday: 'Jan 15', secret });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes key when secret changes', () => {
    const first = makeMemberIdentityKey({ fullName: 'Doe, Jane', birthday: 'Jan 15', secret });
    const second = makeMemberIdentityKey({ fullName: 'Doe, Jane', birthday: 'Jan 15', secret: `${secret}!` });

    expect(first).not.toBe(second);
  });

  it('does not create a key without a birthday', () => {
    expect(makeMemberIdentityKey({ fullName: 'Doe, Jane', birthday: '', secret })).toBeNull();
  });
});
