import { describe, expect, it } from 'vitest';

import enUSCore from '../../messages/en-US/core.json';
import enUSMeetings from '../../messages/en-US/meetings.json';
import enUSPrograms from '../../messages/en-US/programs.json';
import enUSNotifications from '../../messages/en-US/notifications.json';
import enUSMembers from '../../messages/en-US/members.json';
import enUSMembershipOrdinances from '../../messages/en-US/membership-ordinances.json';
import enUSCallings from '../../messages/en-US/callings.json';
import enUSBishopric from '../../messages/en-US/bishopric.json';
import enUSInterviews from '../../messages/en-US/interviews.json';
import enUSTechnology from '../../messages/en-US/technology.json';
import enUSSpeakers from '../../messages/en-US/speakers.json';
import enUSReports from '../../messages/en-US/reports.json';
import enUSAnnouncements from '../../messages/en-US/announcements.json';
import enUSImports from '../../messages/en-US/imports.json';
import enUSSupport from '../../messages/en-US/support.json';
import { MESSAGE_CATALOGS } from './messages';

const enUS = {
  ...enUSCore,
  ...enUSMeetings,
  ...enUSPrograms,
  ...enUSNotifications,
  ...enUSSupport,
  ...enUSMembers,
  ...enUSMembershipOrdinances,
  ...enUSCallings,
  ...enUSBishopric,
  ...enUSInterviews,
  ...enUSTechnology,
  ...enUSSpeakers,
  ...enUSReports,
  ...enUSAnnouncements,
  ...enUSImports
};

function leafPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe('message catalog structure', () => {
  it('keeps all UI message keys aligned across supported interface locales', () => {
    const expected = leafPaths(enUS).sort();
    for (const [locale, catalog] of Object.entries(MESSAGE_CATALOGS)) {
      expect(leafPaths(catalog).sort(), locale).toEqual(expected);
    }
  });

  it('keeps the meeting-form visiting-leader options present in every locale', () => {
    const keys = [
      'visitingLeaderTypePresidingAuthority',
      'visitingLeaderTypeHighCouncilor',
      'visitingLeaderTypeGeneralOfficer',
      'visitingLeaderTypeOther'
    ];
    for (const [locale, catalog] of Object.entries(MESSAGE_CATALOGS)) {
      const meetingForm = catalog.meetingForm as Record<string, unknown>;
      for (const key of keys) expect(meetingForm[key], `${locale}.meetingForm.${key}`).toBeTruthy();
    }
  });

  it('includes the settings labels required by the settings page in every locale', () => {
    for (const catalog of Object.values(MESSAGE_CATALOGS)) {
      const settings = catalog.settings as Record<string, unknown>;
      expect(settings.title).toBeTruthy();
      expect(settings.description).toBeTruthy();
      expect(settings.appearance).toBeTruthy();
      expect(settings.themePreference).toBeTruthy();
    }
  });

  it('merges the expected module-owned namespaces into each runtime catalog', () => {
    const namespaces = [
      'language',
      'settings',
      'dashboard',
      'meetingEditor',
      'print',
      'meetings',
      'stand',
      'meetingForm',
      'business',
      'notes',
      'hymn',
      'deleteMeeting',
      'membership',
      'offline',
      'publicProgram',
      'navigation',
      'auth',
      'shell',
      'account',
      'actionsToDo',
      'programs',
      'notifications',
      'manual',
      'supportHymns',
      'supportQueue',
      'supportAccessRequests',
      'supportProvisioning',
      'supportUsers',
      'supportAuditLog',
      'supportConsole',
      'members',
      'membershipOrdinances',
      'callings',
      'bishopric',
      'interviews',
      'technology',
      'speakers',
      'reports',
      'announcements',
      'imports'
    ];
    for (const catalog of Object.values(MESSAGE_CATALOGS)) {
      expect(Object.keys(catalog).sort()).toEqual(namespaces.sort());
    }
  });
});
