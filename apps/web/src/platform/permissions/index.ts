import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';
import {
  canManageCallings,
  canManageMeetings,
  canManageWardProgramTemplates,
  canRunImports,
  canViewCallings,
  canViewMeetings,
  canViewProgramDesigner,
  hasRole
} from '@/src/auth/roles';
import { composeModulePermissions, createModuleEnablement } from '@/src/modules/enablement';
import { DEFAULT_MODULE_REGISTRY } from '@/src/modules/registry';
import type { ModuleEnablement, ModuleRegistry } from '@/src/modules/types';

export {
  canManageMeetings,
  canViewCallings,
  canViewMeetings,
  hasRole
} from '@/src/auth/roles';

export type PermissionSubject = {
  roles?: string[];
  activeWardId?: string | null;
};

const DEFAULT_MODULE_ENABLEMENT = createModuleEnablement();

export function hasModulePermission(
  subject: PermissionSubject,
  wardId: string,
  permission: string,
  enablement: ModuleEnablement = DEFAULT_MODULE_ENABLEMENT,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
): boolean {
  if (!canAccessWard(subject, wardId)) return false;
  if (permission === 'module-settings.manage') return hasRole(subject.roles, 'STAND_ADMIN');
  if (!composeModulePermissions(wardId, enablement, registry).includes(permission)) return false;

  const session = { roles: subject.roles, activeWardId: subject.activeWardId };
  switch (permission) {
    case 'conducting.view':
    case 'meetings.view':
      return canViewMeetings(session, wardId);
    case 'meetings.manage':
      return canManageMeetings(session, wardId);
    case 'programs.view':
      return canViewProgramDesigner(session, wardId);
    case 'programs.manage':
      return canViewProgramDesigner(session, wardId);
    case 'programs.templates.manage':
      return canManageWardProgramTemplates(session, wardId) || hasRole(subject.roles, 'STAKE_ADMIN') || hasRole(subject.roles, 'SYSTEM_ADMIN') || hasRole(subject.roles, 'SUPPORT_ADMIN');
    case 'callings.view':
      return canViewCallings(session, wardId);
    case 'callings.manage':
      return canManageCallings(session, wardId);
    case 'imports.run':
      return canRunImports(session, wardId);

    case 'support.manage':
      return hasRole(subject.roles, 'SUPPORT_ADMIN') || hasRole(subject.roles, 'SYSTEM_ADMIN');
    case 'technology-checklist.view':
    case 'technology-checklist.manage':
      return canManageMeetings(session, wardId);
    case 'members.view':
    case 'members.manage':
    case 'membership-ordinances.view':
    case 'membership-ordinances.manage':
    case 'notifications.view':
    case 'notifications.manage':
    case 'announcements.view':
    case 'announcements.manage':
    case 'reports.view':
    case 'leadership.view':
    case 'leadership.manage':
    case 'bishopric.view':
    case 'bishopric.manage':
      return hasRole(subject.roles, 'STAND_ADMIN') || hasRole(subject.roles, 'BISHOPRIC_EDITOR') || hasRole(subject.roles, 'CLERK_EDITOR') || hasRole(subject.roles, 'WARD_CLERK') || hasRole(subject.roles, 'MEMBERSHIP_CLERK');
    default:
      return false;
  }
}

export function canAccessWard(subject: PermissionSubject, wardId: string): boolean {
  return subject.activeWardId === wardId;
}

export function assertPermissionWardAccess(context: WardContext, targetWardId: string): void {
  assertWardAccess(context, targetWardId);
}
