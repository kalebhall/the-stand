import { hasRole } from '@/src/auth/roles';

export type AppNavItem = {
  href: string;
  label: string;
};

const CLERK_OR_BISHOPRIC_ROLES = ['BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK'] as const;

function hasAnyRole(roles: string[] | undefined, roleNames: readonly string[]): boolean {
  return roleNames.some((roleName) => hasRole(roles, roleName));
}

export function getNavigationItems(roles: string[] | undefined): AppNavItem[] {
  const items: AppNavItem[] = [{ href: '/dashboard', label: 'Dashboard' }];

  if (hasAnyRole(roles, CLERK_OR_BISHOPRIC_ROLES) || hasRole(roles, 'STAND_ADMIN')) {
    items.push({ href: '/callings', label: 'Callings' });
    items.push({ href: '/announcements', label: 'Announcements' });
    items.push({ href: '/imports', label: 'Imports' });
  }

  if (hasRole(roles, 'STAND_ADMIN')) {
    items.push({ href: '/settings/users', label: 'Settings' });
    items.push({ href: '/settings/public-portal', label: 'Public Portal' });
  }

  if (hasRole(roles, 'SUPPORT_ADMIN')) {
    items.push({ href: '/support/access-requests', label: 'Support Console' });
  }

  return items;
}

export function canViewDashboardPublicPortalStatus(roles: string[] | undefined): boolean {
  return hasRole(roles, 'STAND_ADMIN') || hasRole(roles, 'SUPPORT_ADMIN') || hasRole(roles, 'SYSTEM_ADMIN');
}
