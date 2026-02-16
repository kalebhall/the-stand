export const GLOBAL_ROLES = ['SUPPORT_ADMIN', 'SYSTEM_ADMIN'] as const;

export const WARD_ROLES = [
  'STAND_ADMIN',
  'BISHOPRIC_EDITOR',
  'CLERK_EDITOR',
  'WARD_CLERK',
  'MEMBERSHIP_CLERK',
  'CONDUCTOR_VIEW'
] as const;

export type GlobalRoleName = (typeof GLOBAL_ROLES)[number];
export type WardRoleName = (typeof WARD_ROLES)[number];

export function hasRole(roles: string[] | undefined, role: string): boolean {
  const targetRole = role.trim().toUpperCase();
  return Boolean(roles?.some((candidateRole) => candidateRole.trim().toUpperCase() === targetRole));
}

export function canManageWardUsers(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (hasRole(roles, 'SUPPORT_ADMIN')) {
    return true;
  }

  return hasRole(roles, 'STAND_ADMIN') && session.activeWardId === wardId;
}

export function canAssignRole(actorRoles: string[] | undefined, targetRoleName: string): boolean {
  if (targetRoleName === 'STAND_ADMIN') {
    return hasRole(actorRoles, 'SUPPORT_ADMIN');
  }

  return hasRole(actorRoles, 'STAND_ADMIN') || hasRole(actorRoles, 'SUPPORT_ADMIN');
}


export function canViewMeetings(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (hasRole(roles, 'SUPPORT_ADMIN')) {
    return true;
  }

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

  if (hasRole(roles, 'SUPPORT_ADMIN')) {
    return true;
  }

  if (session.activeWardId !== wardId) {
    return false;
  }

  return hasRole(roles, 'STAND_ADMIN') || hasRole(roles, 'BISHOPRIC_EDITOR') || hasRole(roles, 'CLERK_EDITOR');
}

export function canViewCallings(session: { roles?: string[]; activeWardId?: string | null }, wardId: string): boolean {
  const roles = session.roles ?? [];

  if (hasRole(roles, 'SUPPORT_ADMIN')) {
    return true;
  }

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

  if (hasRole(roles, 'SUPPORT_ADMIN')) {
    return true;
  }

  if (session.activeWardId !== wardId) {
    return false;
  }

  return hasRole(roles, 'STAND_ADMIN') || hasRole(roles, 'BISHOPRIC_EDITOR') || hasRole(roles, 'CLERK_EDITOR');
}
