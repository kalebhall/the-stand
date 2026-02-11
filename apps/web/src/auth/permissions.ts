import type { Session } from 'next-auth';

export const GLOBAL_ROLES = ['SUPPORT_ADMIN', 'SYSTEM_ADMIN'] as const;
export const WARD_ROLES = [
  'STAND_ADMIN',
  'BISHOPRIC_EDITOR',
  'CLERK_EDITOR',
  'WARD_CLERK',
  'MEMBERSHIP_CLERK',
  'CONDUCTOR_VIEW'
] as const;

export const ALL_ROLES = [...GLOBAL_ROLES, ...WARD_ROLES] as const;

export type RoleName = (typeof ALL_ROLES)[number];

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  MANAGE_WARD_USERS: 'MANAGE_WARD_USERS',
  ASSIGN_WARD_ROLES: 'ASSIGN_WARD_ROLES',
  REVOKE_WARD_ROLES: 'REVOKE_WARD_ROLES',
  PROVISION_STAKE_WARD: 'PROVISION_STAKE_WARD'
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const rolePermissionMap: Record<RoleName, Permission[]> = {
  SUPPORT_ADMIN: [PERMISSIONS.PROVISION_STAKE_WARD],
  SYSTEM_ADMIN: [],
  STAND_ADMIN: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_WARD_USERS,
    PERMISSIONS.ASSIGN_WARD_ROLES,
    PERMISSIONS.REVOKE_WARD_ROLES
  ],
  BISHOPRIC_EDITOR: [PERMISSIONS.VIEW_DASHBOARD],
  CLERK_EDITOR: [PERMISSIONS.VIEW_DASHBOARD],
  WARD_CLERK: [PERMISSIONS.VIEW_DASHBOARD],
  MEMBERSHIP_CLERK: [PERMISSIONS.VIEW_DASHBOARD],
  CONDUCTOR_VIEW: [PERMISSIONS.VIEW_DASHBOARD]
};

export class AuthzError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'AuthzError';
  }
}

export function requireAuthenticated(session: Session | null): asserts session is Session {
  if (!session?.user?.id) {
    throw new AuthzError(403, 'Forbidden', 'FORBIDDEN');
  }
}

export function requireRole(session: Session | null, roles: RoleName | RoleName[]): void {
  requireAuthenticated(session);

  const required = Array.isArray(roles) ? roles : [roles];
  const hasAnyRole = required.some((role) => session.user.roles.includes(role));

  if (!hasAnyRole) {
    throw new AuthzError(403, 'Forbidden', 'FORBIDDEN');
  }
}

export function hasPermission(session: Session | null, permission: Permission): boolean {
  if (!session?.user?.id) return false;

  return session.user.roles.some((role) => {
    if (!ALL_ROLES.includes(role as RoleName)) return false;
    return rolePermissionMap[role as RoleName].includes(permission);
  });
}

export function requirePermission(session: Session | null, permission: Permission): void {
  requireAuthenticated(session);

  if (!hasPermission(session, permission)) {
    throw new AuthzError(403, 'Forbidden', 'FORBIDDEN');
  }
}

export function requireWardRouteAccess(session: Session | null, wardId: string): void {
  requireAuthenticated(session);

  if (!session.activeWardId || session.activeWardId !== wardId.trim()) {
    throw new AuthzError(403, 'Forbidden', 'FORBIDDEN');
  }
}

export const ALL_ROLE_SEEDS: Array<{ name: RoleName; scope: 'GLOBAL' | 'WARD' }> = [
  { name: 'SUPPORT_ADMIN', scope: 'GLOBAL' },
  { name: 'SYSTEM_ADMIN', scope: 'GLOBAL' },
  { name: 'STAND_ADMIN', scope: 'WARD' },
  { name: 'BISHOPRIC_EDITOR', scope: 'WARD' },
  { name: 'CLERK_EDITOR', scope: 'WARD' },
  { name: 'WARD_CLERK', scope: 'WARD' },
  { name: 'MEMBERSHIP_CLERK', scope: 'WARD' },
  { name: 'CONDUCTOR_VIEW', scope: 'WARD' }
];
