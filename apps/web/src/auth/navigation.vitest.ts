import { describe, expect, it } from 'vitest';

import { canViewDashboardPublicPortalStatus, getNavigationGroups, getNavigationItems } from '@/src/auth/navigation';
import { createModuleEnablement } from '@/src/modules/enablement';
import { DEFAULT_MODULE_REGISTRY } from '@/src/modules/registry';

function allModulesEnabled() {
  return createModuleEnablement({
    ward: Object.fromEntries(DEFAULT_MODULE_REGISTRY.modules.map((module) => [module.id, true]))
  });
}

describe('getNavigationItems', () => {
  it('always includes dashboard for authenticated users', () => {
    expect(getNavigationItems([])).toContainEqual({ href: '/dashboard', label: 'Dashboard' });
  });

  it('shows Programs to program users but excludes unrelated workflows', () => {
    const items = getNavigationItems(['PROGRAM_EDITOR'], 'ward', allModulesEnabled());
    expect(items).toContainEqual({ href: '/programs', label: 'Programs' });
    expect(items).toContainEqual({ href: '/programs/templates', label: 'Templates' });
    expect(items).not.toContainEqual({ href: '/callings', label: 'Callings' });
    expect(items).not.toContainEqual({ href: '/members', label: 'Members' });
    expect(items).not.toContainEqual({ href: '/imports', label: 'Imports' });
  });

  it('shows template administration to stake, system, and support administrators without exposing ward program editing', () => {
    const enablement = allModulesEnabled();
    expect(getNavigationItems(['STAKE_ADMIN'], 'ward', enablement)).toContainEqual({ href: '/programs/templates/admin', label: 'Template Administration' });
    expect(getNavigationItems(['STAKE_ADMIN'], 'ward', enablement)).not.toContainEqual({ href: '/programs/templates', label: 'Templates' });
    expect(getNavigationItems(['STAKE_ADMIN'], 'ward', enablement)).not.toContainEqual({ href: '/programs', label: 'Programs' });
    expect(getNavigationItems(['SYSTEM_ADMIN'], 'ward', enablement)).toContainEqual({ href: '/programs/templates/admin', label: 'Template Administration' });
    expect(getNavigationItems(['SUPPORT_ADMIN'], 'ward', enablement)).toContainEqual({ href: '/programs/templates/admin', label: 'Template Administration' });
  });
  it('includes ward management links for stand admin but keeps settings in settings', () => {
    const items = getNavigationItems(['STAND_ADMIN'], 'ward', allModulesEnabled());

    expect(items).toContainEqual({ href: '/members', label: 'Members' });
    expect(items).toContainEqual({ href: '/callings', label: 'Callings' });
    expect(items).toContainEqual({ href: '/speakers', label: 'Speaker Lifecycle' });
    expect(items).toContainEqual({ href: '/bishopric', label: 'Bishopric Agenda' });
    expect(items).toContainEqual({ href: '/interviews', label: 'Scheduled Interviews' });
    expect(items).toContainEqual({ href: '/technology', label: 'Technology Checklist' });
    expect(items).toContainEqual({ href: '/membership-ordinances', label: 'Membership & Ordinances' });
    expect(items).toContainEqual({ href: '/notifications', label: 'Notifications' });

    expect(items).toContainEqual({ href: '/reports', label: 'Reports' });
    expect(items).not.toContainEqual({ href: '/settings/stand-script', label: 'Stand Script' });
    expect(items).not.toContainEqual({ href: '/settings/public-portal', label: 'Public Portal' });
  });

  it('includes meetings for conductor role', () => {
    expect(getNavigationItems(['CONDUCTOR_VIEW'], 'ward', allModulesEnabled())).toContainEqual({ href: '/meetings', label: 'Meetings' });

    expect(getNavigationItems(['CONDUCTOR_VIEW'], 'ward', allModulesEnabled())).not.toContainEqual({ href: '/callings', label: 'Callings' });
  });

  it('includes support console only for support admins', () => {
    expect(getNavigationItems(['SUPPORT_ADMIN'], 'ward', allModulesEnabled())).toContainEqual({
      href: '/support',
      label: 'Support Console'
    });

    expect(getNavigationItems(['BISHOPRIC_EDITOR'], 'ward', allModulesEnabled())).not.toContainEqual({
      href: '/support',
      label: 'Support Console'
    });
  });

  it('hides disabled optional features', () => {
    const enablement = createModuleEnablement({
      ward: {
        bishopric: false,
        leadership: false,
        'technology-checklist': true
      }
    });
    const items = getNavigationItems(['STAND_ADMIN'], 'ward', enablement);
    const hrefs = items.map((item) => item.href);
    expect(hrefs).toContain('/technology');
    expect(hrefs).not.toContain('/bishopric');
    expect(hrefs).not.toContain('/interviews');
    expect(hrefs).not.toContain('/speakers');
  });
});

describe('canViewDashboardPublicPortalStatus', () => {
  it('allows stand admin and support admin', () => {
    expect(canViewDashboardPublicPortalStatus(['STAND_ADMIN'])).toBe(true);
    expect(canViewDashboardPublicPortalStatus(['SUPPORT_ADMIN'])).toBe(true);
  });

  it('blocks non-admin roles', () => {
    expect(canViewDashboardPublicPortalStatus(['CONDUCTOR_VIEW'])).toBe(false);
  });
});

describe('getNavigationGroups', () => {
  it('preserves canonical item order while assigning visible items to fixed groups', () => {
    const groups = getNavigationGroups(['STAND_ADMIN'], 'ward', allModulesEnabled());
    expect(groups.map((group) => group.id)).toEqual(['workspace', 'ward', 'ministry', 'administration']);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(['/dashboard', '/programs', '/programs/templates', '/meetings']);
    expect(groups[1]?.items.map((item) => item.href)).toEqual(['/bishopric', '/interviews', '/technology']);
  });

  it('omits empty groups and keeps support isolated to support users', () => {
    const conductorGroups = getNavigationGroups(['CONDUCTOR_VIEW'], 'ward', allModulesEnabled());
    expect(conductorGroups.map((group) => group.id)).toEqual(['workspace']);
    expect(getNavigationGroups(['SUPPORT_ADMIN'], 'ward', allModulesEnabled()).map((group) => group.id)).toContain('support');
  });
});
