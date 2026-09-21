import { describe, expect, it } from 'vitest';

import {
  canAssignRole,
  canManageMeetings,
  canManageWardUsers,
  canUseInternalNotes,
  canViewCallings,
  canViewMeetings,
  canViewProgramDesigner,
  canEditProgramDesign,
  canManageProgramMedia,
  canPublishProgram,
  canUseAdvancedProgramDesigner,
  canDeleteProgramMedia,
  canManageWardProgramTemplates,
  canRunImports,
  hasRole,
  WARD_ROLES,
  canViewStakeTemplates,
  canManageStakeTemplates,
  canManageSystemTemplates,
  canCopyAvailableTemplate
} from './roles';

describe('canManageWardUsers', () => {
  it('allows ward STAND_ADMIN only within their active ward', () => {
    expect(canManageWardUsers({ roles: ['STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
    expect(canManageWardUsers({ roles: ['STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-b')).toBe(false);
  });

  it('does not allow SUPPORT_ADMIN without a delegated ward role in the active ward', () => {
    expect(canManageWardUsers({ roles: ['SUPPORT_ADMIN'], activeWardId: null }, 'ward-a')).toBe(false);
    expect(canManageWardUsers({ roles: ['SUPPORT_ADMIN', 'STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
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

  it('requires an active delegated ward role even for support admins', () => {
    expect(canViewMeetings({ roles: ['SUPPORT_ADMIN'], activeWardId: 'ward-a' }, 'ward-a')).toBe(false);
    expect(canManageMeetings({ roles: ['SUPPORT_ADMIN'], activeWardId: 'ward-a' }, 'ward-a')).toBe(false);
    expect(canViewMeetings({ roles: ['SUPPORT_ADMIN', 'STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
    expect(canManageMeetings({ roles: ['SUPPORT_ADMIN', 'STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
  });

  it('restricts meeting management to editor/admin roles', () => {
    expect(canManageMeetings({ roles: ['BISHOPRIC_EDITOR'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
    expect(canManageMeetings({ roles: ['CONDUCTOR_VIEW'], activeWardId: 'ward-a' }, 'ward-a')).toBe(false);
  });
});

describe('program permissions', () => {
  it('declares PROGRAM_EDITOR as a ward-scoped role', () => {
    expect(WARD_ROLES).toContain('PROGRAM_EDITOR');
  });

  const active = { roles: ['PROGRAM_EDITOR'], activeWardId: 'ward-a' };

  it('limits PROGRAM_EDITOR to the active ward and program helpers', () => {
    expect(canViewProgramDesigner(active, 'ward-a')).toBe(true);
    expect(canEditProgramDesign(active, 'ward-a')).toBe(true);
    expect(canManageProgramMedia(active, 'ward-a')).toBe(true);
    expect(canViewProgramDesigner(active, 'ward-b')).toBe(false);
    expect(canManageMeetings(active, 'ward-a')).toBe(false);
    expect(canUseInternalNotes(active, 'ward-a')).toBe(false);
    expect(canRunImports(active, 'ward-a')).toBe(false);
  });

  it('keeps publishing, advanced design, and template creation independently controlled', () => {
    expect(canPublishProgram(active, 'ward-a')).toBe(false);
    expect(canUseAdvancedProgramDesigner(active, 'ward-a')).toBe(false);
    expect(canPublishProgram(active, 'ward-a', { allowProgramEditorPublish: true })).toBe(true);
    expect(canUseAdvancedProgramDesigner(active, 'ward-a', { allowAdvancedProgramDesigner: true })).toBe(true);
    expect(canManageWardProgramTemplates(active, 'ward-a', { allowProgramEditorCreateTemplates: true })).toBe(true);
  });
});

describe('internal note permissions', () => {
  it('allows specified ward leadership roles only in active ward', () => {
    for (const role of ['STAND_ADMIN', 'BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK']) {
      expect(canUseInternalNotes({ roles: [role], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
    }
    expect(canUseInternalNotes({ roles: ['CONDUCTOR_VIEW'], activeWardId: 'ward-a' }, 'ward-a')).toBe(false);
    expect(canUseInternalNotes({ roles: ['STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-b')).toBe(false);
  });
});

describe('role normalization', () => {
  it('matches roles case-insensitively', () => {
    expect(hasRole(['stand_admin'], 'STAND_ADMIN')).toBe(true);
    expect(hasRole(['  Support_Admin  '], 'SUPPORT_ADMIN')).toBe(true);
  });

  it('allows imports access for stand admins when role casing differs', () => {
    expect(canViewCallings({ roles: ['stand_admin'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
  });
});

describe('stake template authorization', () => {
  const stakeAdmin = { roles: [], activeWardId: 'ward-a', activeStakeId: 'stake-a', stakeAssignments: [{ stakeId: 'stake-a', roleNames: ['STAKE_ADMIN' as const] }] };
  it('requires explicit stake assignment', () => {
    expect(canViewStakeTemplates(stakeAdmin, 'stake-a')).toBe(true);
    expect(canManageStakeTemplates(stakeAdmin, 'stake-a')).toBe(true);
    expect(canManageStakeTemplates({ ...stakeAdmin, stakeAssignments: [] }, 'stake-a')).toBe(false);
    expect(canManageStakeTemplates({ roles: ['SUPPORT_ADMIN'], activeWardId: 'ward-a', activeStakeId: 'stake-a' }, 'stake-a')).toBe(false);
  });
  it('does not let ward roles manage system templates', () => {
    expect(canManageSystemTemplates({ roles: ['STAND_ADMIN'], activeWardId: 'ward-a' })).toBe(false);
    expect(canManageSystemTemplates({ roles: ['SYSTEM_ADMIN'], activeWardId: null })).toBe(true);
  });
  it('copies only published templates visible to the target ward', () => {
    expect(canCopyAvailableTemplate(stakeAdmin, { scopeType: 'STAKE', scopeId: 'stake-a', status: 'PUBLISHED' }, 'ward-a', 'u')).toBe(true);
    expect(canCopyAvailableTemplate(stakeAdmin, { scopeType: 'STAKE', scopeId: 'stake-b', status: 'PUBLISHED' }, 'ward-a', 'u')).toBe(false);
    expect(canCopyAvailableTemplate(stakeAdmin, { scopeType: 'WARD', scopeId: 'ward-a', status: 'DRAFT' }, 'ward-a', 'u')).toBe(false);
  });
});

describe('program media authorization', () => {
  const editor = { roles: ['PROGRAM_EDITOR'], activeWardId: 'ward-a' };
  it('requires the delete profile flag for Program Editor deletes', () => {
    expect(canDeleteProgramMedia(editor, 'ward-a')).toBe(false);
    expect(canDeleteProgramMedia(editor, 'ward-a', { allowProgramEditorDeleteMedia: true })).toBe(true);
    expect(canDeleteProgramMedia({ roles: ['STAND_ADMIN'], activeWardId: 'ward-a' }, 'ward-a')).toBe(true);
  });
});
