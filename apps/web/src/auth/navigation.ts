import { hasRole } from '@/src/auth/roles';
import { composeModuleNavigation, createModuleEnablement } from '@/src/modules/enablement';
import { DEFAULT_MODULE_REGISTRY } from '@/src/modules/registry';
import type { ModuleEnablement, ModuleRegistry } from '@/src/modules/types';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';

export type AppNavItem = {
  href: string;
  label: string;
};

export type AppNavGroup = {
  id: 'workspace' | 'ward' | 'ministry' | 'administration' | 'support';
  label: string;
  items: AppNavItem[];
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

const NAV_GROUPS: readonly Omit<AppNavGroup, 'items'>[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'ward', label: 'Ward Operations' },
  { id: 'ministry', label: 'People and Ministry' },
  { id: 'administration', label: 'Administration' },
  { id: 'support', label: 'Support' }
];

const NAV_GROUP_BY_HREF: Readonly<Record<string, AppNavGroup['id']>> = {
  '/dashboard': 'workspace',
  '/programs': 'workspace',
  '/programs/templates': 'workspace',
  '/programs/templates/admin': 'workspace',
  '/meetings': 'workspace',
  '/bishopric': 'ward',
  '/interviews': 'ward',
  '/technology': 'ward',
  '/members': 'ministry',
  '/callings': 'ministry',
  '/speakers': 'ministry',
  '/membership-ordinances': 'ministry',
  '/notifications': 'ministry',
  '/announcements': 'administration',
  '/reports': 'administration',
  '/imports': 'administration',
  '/support': 'support'
};

export function getNavigationGroups(
  roles: string[] | undefined,
  wardId = 'default',
  enablement: ModuleEnablement = DEFAULT_MODULE_ENABLEMENT,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY,
  advancedDesignerEnabled = isAdvancedDesignerFeatureEnabled()
): AppNavGroup[] {
  const groups = NAV_GROUPS.map((group) => ({ ...group, items: [] as AppNavItem[] }));
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  for (const item of getNavigationItems(roles, wardId, enablement, registry, advancedDesignerEnabled)) {
    const group = groupMap.get(NAV_GROUP_BY_HREF[item.href]);
    if (group) group.items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

export function canViewDashboardPublicPortalStatus(roles: string[] | undefined): boolean {
  return hasRole(roles, 'STAND_ADMIN') || hasRole(roles, 'SUPPORT_ADMIN') || hasRole(roles, 'SYSTEM_ADMIN');
}
