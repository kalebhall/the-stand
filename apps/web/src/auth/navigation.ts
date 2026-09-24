import { hasRole } from '@/src/auth/roles';
import { composeModuleNavigation, createModuleEnablement } from '@/src/modules/enablement';
import { DEFAULT_MODULE_REGISTRY } from '@/src/modules/registry';
import type { ModuleEnablement, ModuleRegistry } from '@/src/modules/types';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';

export type AppNavItem = {
  href: string;
  label: string;
};

const CLERK_OR_BISHOPRIC_ROLES = ['BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK'] as const;
const MEETING_VIEW_ROLES = [...CLERK_OR_BISHOPRIC_ROLES, 'CONDUCTOR_VIEW'] as const;

function hasAnyRole(roles: string[] | undefined, roleNames: readonly string[]): boolean {
  return roleNames.some((roleName) => hasRole(roles, roleName));
}

const DEFAULT_MODULE_ENABLEMENT = createModuleEnablement();

export function getNavigationItems(
  roles: string[] | undefined,
  wardId = 'default',
  enablement: ModuleEnablement = DEFAULT_MODULE_ENABLEMENT,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY,
  advancedDesignerEnabled = isAdvancedDesignerFeatureEnabled()
): AppNavItem[] {
  const enabledNavigation = new Map(composeModuleNavigation(wardId, enablement, registry).map((item) => [item.href, item]));
  const items: AppNavItem[] = [];
  const add = (moduleId: string, href: string, allowed: boolean): void => {
    if (!allowed) return;
    const item = registry.get(moduleId)?.navigation.find((candidate) => candidate.href === href);
    if (item && enabledNavigation.has(item.href)) items.push(item);
  };

  add('conducting-core', '/dashboard', true);

  const canViewPrograms = hasRole(roles, 'PROGRAM_EDITOR') || hasRole(roles, 'BISHOPRIC_EDITOR') || hasRole(roles, 'STAND_ADMIN');
  const canAdministerTemplates = hasRole(roles, 'STAKE_ADMIN') || hasRole(roles, 'SYSTEM_ADMIN') || hasRole(roles, 'SUPPORT_ADMIN');
  if (advancedDesignerEnabled) {
    add('programs', '/programs', canViewPrograms);
    add('programs', '/programs/templates', canViewPrograms);
    add('programs', '/programs/templates/admin', canAdministerTemplates);
  }

  if (hasAnyRole(roles, MEETING_VIEW_ROLES) || hasRole(roles, 'STAND_ADMIN')) {
    add('conducting-core', '/meetings', true);
  }

  if (hasAnyRole(roles, CLERK_OR_BISHOPRIC_ROLES) || hasRole(roles, 'STAND_ADMIN')) {
    add('bishopric', '/bishopric', true);
    add('leadership', '/interviews', true);
    add('technology-checklist', '/technology', true);
  }

  if (hasAnyRole(roles, CLERK_OR_BISHOPRIC_ROLES) || hasRole(roles, 'STAND_ADMIN')) {
    add('members', '/members', true);
    add('callings', '/callings', true);
    add('leadership', '/speakers', true);
    add('membership-ordinances', '/membership-ordinances', true);
    add('notifications', '/notifications', true);
    add('announcements', '/announcements', true);
    add('reports', '/reports', true);
    add('imports', '/imports', true);
  }

  if (hasRole(roles, 'SUPPORT_ADMIN')) {
    add('support', '/support', true);
  }

  return items;
}

export function canViewDashboardPublicPortalStatus(roles: string[] | undefined): boolean {
  return hasRole(roles, 'STAND_ADMIN') || hasRole(roles, 'SUPPORT_ADMIN') || hasRole(roles, 'SYSTEM_ADMIN');
}
