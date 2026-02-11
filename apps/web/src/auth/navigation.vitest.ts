import { describe, expect, it } from 'vitest';

import { canViewDashboardPublicPortalStatus, getNavigationItems } from '@/src/auth/navigation';

describe('getNavigationItems', () => {
  it('always includes dashboard for authenticated users', () => {
    expect(getNavigationItems([])).toContainEqual({ href: '/dashboard', label: 'Dashboard' });
  });

  it('includes ward admin links for stand admin', () => {
    const items = getNavigationItems(['STAND_ADMIN']);

    expect(items).toContainEqual({ href: '/settings/users', label: 'Settings' });
    expect(items).toContainEqual({ href: '/settings/public-portal', label: 'Public Portal' });
    expect(items).toContainEqual({ href: '/callings', label: 'Callings' });
  });


  it('includes meetings for conductor role', () => {
    expect(getNavigationItems(['CONDUCTOR_VIEW'])).toContainEqual({ href: '/meetings', label: 'Meetings' });
    expect(getNavigationItems(['CONDUCTOR_VIEW'])).not.toContainEqual({ href: '/callings', label: 'Callings' });
  });

  it('includes support console only for support admins', () => {
    expect(getNavigationItems(['SUPPORT_ADMIN'])).toContainEqual({
      href: '/support/access-requests',
      label: 'Support Console'
    });

    expect(getNavigationItems(['BISHOPRIC_EDITOR'])).not.toContainEqual({
      href: '/support/access-requests',
      label: 'Support Console'
    });
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
