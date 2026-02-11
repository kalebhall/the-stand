import { describe, expect, it } from 'vitest';

import { canAssignRole, canManageMeetings, canManageWardUsers, canViewMeetings } from './roles';

describe('canManageWardUsers', () => {
  it('allows ward STAND_ADMIN only within their active ward', () => {
    expect(canManageWardUsers({ roles: ['STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
    expect(canManageWardUsers({ roles: ['STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-b')).toBe(false);
  });

  it('allows SUPPORT_ADMIN across wards', () => {
    expect(canManageWardUsers({ roles: ['SUPPORT_ADMIN'], activeWardId: null }, 'ward-a')).toBe(true);
  });
});

describe('canAssignRole', () => {
  it('prevents STAND_ADMIN assignment unless actor is SUPPORT_ADMIN', () => {
    expect(canAssignRole(['STAND_ADMIN'], 'STAND_ADMIN')).toBe(false);
    expect(canAssignRole(['SUPPORT_ADMIN'], 'STAND_ADMIN')).toBe(true);
  });

  it('allows ward role assignment for STAND_ADMIN', () => {
    expect(canAssignRole(['STAND_ADMIN'], 'WARD_CLERK')).toBe(true);
  });
});


describe('meeting permissions', () => {
  it('allows meeting read roles in active ward', () => {
    expect(canViewMeetings({ roles: ['CONDUCTOR_VIEW'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
    expect(canViewMeetings({ roles: ['CONDUCTOR_VIEW'], activeWardId: 'ward-a' }, 'ward-b')).toBe(false);
  });

  it('restricts meeting management to editor/admin roles', () => {
    expect(canManageMeetings({ roles: ['BISHOPRIC_EDITOR'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
    expect(canManageMeetings({ roles: ['CONDUCTOR_VIEW'], activeWardId: 'ward-a' }, 'ward-a')).toBe(false);
  });
});
