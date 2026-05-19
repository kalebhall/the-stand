import { describe, expect, it } from 'vitest';

import { chooseActiveWardId, isSupportGrantActive, type WardAccessAssignment } from './support-access';

describe('isSupportGrantActive', () => {
  it('returns true for an unrevoked support grant that has not expired', () => {
    expect(
      isSupportGrantActive({
        wardId: 'ward-a',
        isSupportAssignment: true,
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      })
    ).toBe(true);
  });

  it('returns false for non-support assignments, expired grants, or revoked grants', () => {
    const cases: WardAccessAssignment[] = [
      {
        wardId: 'ward-a',
        isSupportAssignment: false,
        expiresAt: null,
        revokedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        wardId: 'ward-b',
        isSupportAssignment: true,
        expiresAt: '2020-01-01T00:00:00.000Z',
        revokedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        wardId: 'ward-c',
        isSupportAssignment: true,
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: '2026-01-02T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ];

    for (const assignment of cases) {
      expect(isSupportGrantActive(assignment)).toBe(false);
    }
  });
});

describe('chooseActiveWardId', () => {
  it('prefers the newest active support grant for support admins', () => {
    const assignments: WardAccessAssignment[] = [
      {
        wardId: 'regular-ward',
        isSupportAssignment: false,
        expiresAt: null,
        revokedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        wardId: 'support-older',
        isSupportAssignment: true,
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: null,
        createdAt: '2026-02-01T00:00:00.000Z'
      },
      {
        wardId: 'support-newer',
        isSupportAssignment: true,
        expiresAt: '2099-01-02T00:00:00.000Z',
        revokedAt: null,
        createdAt: '2026-03-01T00:00:00.000Z'
      }
    ];

    expect(chooseActiveWardId({ isSupportAdmin: true, assignments })).toBe('support-newer');
  });

  it('falls back to the earliest non-support ward when no active support grant exists', () => {
    const assignments: WardAccessAssignment[] = [
      {
        wardId: 'ward-a',
        isSupportAssignment: false,
        expiresAt: null,
        revokedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        wardId: 'ward-b',
        isSupportAssignment: true,
        expiresAt: '2020-01-01T00:00:00.000Z',
        revokedAt: null,
        createdAt: '2026-02-01T00:00:00.000Z'
      }
    ];

    expect(chooseActiveWardId({ isSupportAdmin: true, assignments })).toBe('ward-a');
    expect(chooseActiveWardId({ isSupportAdmin: false, assignments })).toBe('ward-a');
  });
});
