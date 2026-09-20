export const GLOBAL_ROLES = ['SUPPORT_ADMIN', 'SYSTEM_ADMIN'] as const;

export const WARD_ROLES = ['STAND_ADMIN', 'BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK', 'CONDUCTOR_VIEW', 'PROGRAM_EDITOR'] as const;

export type GlobalRoleName = (typeof GLOBAL_ROLES)[number];
export type WardRoleName = (typeof WARD_ROLES)[number];

export type ProgramPermissionProfile = {
  allowAdvancedProgramDesigner?: boolean;
  allowProgramEditorPublish?: boolean;
  allowProgramEditorRepublish?: boolean;
  allowProgramEditorRollback?: boolean;
  allowProgramEditorCreateTemplates?: boolean;
  allowProgramEditorDeleteMedia?: boolean;
};

export function hasRole(roles: string[] | undefined, role: string): boolean {
  const targetRole = role.trim().toUpperCase();
  return Boolean(roles?.some((candidateRole) => candidateRole.trim().toUpperCase() === targetRole));
}

export function canManageWardUsers(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  return hasRole(session.roles, 'STAND_ADMIN') && session.activeWardId === wardId;
}

export function canAssignRole(actorRoles: string[] | undefined, targetRoleName: string): boolean {
  if (targetRoleName === 'STAND_ADMIN') {
    return hasRole(actorRoles, 'SUPPORT_ADMIN');
  }

  return hasRole(actorRoles, 'STAND_ADMIN') || hasRole(actorRoles, 'SUPPORT_ADMIN');
}

export function canViewMeetings(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (session.activeWardId !== wardId) {
    return false;
  }

  return (
    hasRole(roles, 'STAND_ADMIN') ||
    hasRole(roles, 'BISHOPRIC_EDITOR') ||
    hasRole(roles, 'CLERK_EDITOR') ||
    hasRole(roles, 'WARD_CLERK') ||
    hasRole(roles, 'MEMBERSHIP_CLERK') ||
    hasRole(roles, 'CONDUCTOR_VIEW')
  );
}

export function canManageMeetings(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (session.activeWardId !== wardId) {
    return false;
  }

  return hasRole(roles, 'STAND_ADMIN') || hasRole(roles, 'BISHOPRIC_EDITOR') || hasRole(roles, 'CLERK_EDITOR');
}

function inActiveWard(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  return session.activeWardId === wardId;
}

export function canViewProgramDesigner(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  return inActiveWard(session, wardId) && (hasRole(session.roles, 'STAND_ADMIN') || hasRole(session.roles, 'BISHOPRIC_EDITOR') || hasRole(session.roles, 'PROGRAM_EDITOR'));
}

export function canEditProgramDesign(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  return canViewProgramDesigner(session, wardId);
}

export function canManageWardProgramTemplates(session: { roles?: string[]; activeWardId?: string | null }, wardId: string, profile: ProgramPermissionProfile = {}): boolean {
  return inActiveWard(session, wardId) && (hasRole(session.roles, 'STAND_ADMIN') || (hasRole(session.roles, 'PROGRAM_EDITOR') && profile.allowProgramEditorCreateTemplates === true));
}

export function canManageProgramMedia(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  return canViewProgramDesigner(session, wardId);
}

export function canPublishProgram(session: { roles?: string[]; activeWardId?: string | null }, wardId: string, profile: ProgramPermissionProfile = {}): boolean {
  return inActiveWard(session, wardId) && (hasRole(session.roles, 'STAND_ADMIN') || hasRole(session.roles, 'BISHOPRIC_EDITOR') || (hasRole(session.roles, 'PROGRAM_EDITOR') && profile.allowProgramEditorPublish === true));
}

export function canRepublishProgram(session: { roles?: string[]; activeWardId?: string | null }, wardId: string, profile: ProgramPermissionProfile = {}): boolean {
  return inActiveWard(session, wardId) && (hasRole(session.roles, 'STAND_ADMIN') || hasRole(session.roles, 'BISHOPRIC_EDITOR') || (hasRole(session.roles, 'PROGRAM_EDITOR') && profile.allowProgramEditorRepublish === true));
}

export function canRollbackProgram(session: { roles?: string[]; activeWardId?: string | null }, wardId: string, profile: ProgramPermissionProfile = {}): boolean {
  return inActiveWard(session, wardId) && (hasRole(session.roles, 'STAND_ADMIN') || (hasRole(session.roles, 'PROGRAM_EDITOR') && profile.allowProgramEditorRollback === true));
}

export function canUseAdvancedProgramDesigner(session: { roles?: string[]; activeWardId?: string | null }, wardId: string, profile: ProgramPermissionProfile = {}): boolean {
  return inActiveWard(session, wardId) && (hasRole(session.roles, 'STAND_ADMIN') || hasRole(session.roles, 'BISHOPRIC_EDITOR') || (hasRole(session.roles, 'PROGRAM_EDITOR') && profile.allowAdvancedProgramDesigner === true));
}

export function canViewCallings(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (session.activeWardId !== wardId) {
    return false;
  }

  return (
    hasRole(roles, 'STAND_ADMIN') ||
    hasRole(roles, 'BISHOPRIC_EDITOR') ||
    hasRole(roles, 'CLERK_EDITOR') ||
    hasRole(roles, 'WARD_CLERK') ||
    hasRole(roles, 'MEMBERSHIP_CLERK')
  );
}

export function canManageCallings(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (session.activeWardId !== wardId) {
    return false;
  }

  return hasRole(roles, 'STAND_ADMIN') || hasRole(roles, 'BISHOPRIC_EDITOR') || hasRole(roles, 'CLERK_EDITOR');
}

export function canUseInternalNotes(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (session.activeWardId !== wardId) {
    return false;
  }

  return (
    hasRole(roles, 'STAND_ADMIN') ||
    hasRole(roles, 'BISHOPRIC_EDITOR') ||
    hasRole(roles, 'CLERK_EDITOR') ||
    hasRole(roles, 'WARD_CLERK') ||
    hasRole(roles, 'MEMBERSHIP_CLERK')
  );
}

export function canRunImports(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (session.activeWardId !== wardId) {
    return false;
  }

  return hasRole(roles, 'STAND_ADMIN') || hasRole(roles, 'CLERK_EDITOR');
}
