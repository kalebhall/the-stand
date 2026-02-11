import { describe, expect, it } from 'vitest';

import { hasPermission, PERMISSIONS, requirePermission, requireRole } from './permissions';

describe('permissions helpers', () => {
  const standAdminSession = {
    user: { id: 'u1', roles: ['STAND_ADMIN'] },
    activeWardId: 'ward-1'
  } as any;

  it('requireRole passes when user has role', () => {
    expect(() => requireRole(standAdminSession, 'STAND_ADMIN')).not.toThrow();
  });

  it('requirePermission throws 403 when user lacks permission', () => {
    expect(() => requirePermission(standAdminSession, PERMISSIONS.PROVISION_STAKE_WARD)).toThrowError('Forbidden');
  });

  it('hasPermission returns true when role grants permission', () => {
    expect(hasPermission(standAdminSession, PERMISSIONS.ASSIGN_WARD_ROLES)).toBe(true);
  });
});
