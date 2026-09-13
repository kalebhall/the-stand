import { describe, expect, it } from 'vitest';

import { canViewDashboardPublicPortalStatus, getNavigationItems } from '@/src/auth/navigation';

describe('getNavigationItems', () => {
  it('always includes dashboard for authenticated users', () => {
    expect(getNavigationItems([])).toContainEqual({ href: '/dashboard', label: 'Dashboard' });
  });

  it('includes ward management links for stand admin but keeps settings in settings', () => {
    const items = getNavigationItems(['STAND_ADMIN']);

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
    expect(getNavigationItems(['CONDUCTOR_VIEW'])).toContainEqual({ href: '/meetings', label: 'Meetings' });

    expect(getNavigationItems(['CONDUCTOR_VIEW'])).not.toContainEqual({ href: '/callings', label: 'Callings' });
  });

  it('includes support console only for support admins', () => {
    expect(getNavigationItems(['SUPPORT_ADMIN'])).toContainEqual({
      href: '/support',
      label: 'Support Console'
    });

    expect(getNavigationItems(['BISHOPRIC_EDITOR'])).not.toContainEqual({
      href: '/support',
      label: 'Support Console'
    });
  });

  it('hides disabled optional features', () => {
    const items = getNavigationItems(['STAND_ADMIN'], {
      BISHOPRIC_AGENDA: false,
      SCHEDULED_INTERVIEWS: false,
      TECHNOLOGY_CHECKLIST: true,
      SPEAKER_LIFECYCLE: false
    });
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
