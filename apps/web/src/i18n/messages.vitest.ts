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
import esCore from '../../messages/es/core.json';
import esMeetings from '../../messages/es/meetings.json';
import esPrograms from '../../messages/es/programs.json';
import esNotifications from '../../messages/es/notifications.json';
import esMembers from '../../messages/es/members.json';
import esMembershipOrdinances from '../../messages/es/membership-ordinances.json';
import esCallings from '../../messages/es/callings.json';
import esBishopric from '../../messages/es/bishopric.json';
import esInterviews from '../../messages/es/interviews.json';
import esTechnology from '../../messages/es/technology.json';
import esSpeakers from '../../messages/es/speakers.json';
import esReports from '../../messages/es/reports.json';
import esAnnouncements from '../../messages/es/announcements.json';
import esImports from '../../messages/es/imports.json';
import esSupport from '../../messages/es/support.json';
import enXACore from '../../messages/en-XA/core.json';
import enXAMeetings from '../../messages/en-XA/meetings.json';
import enXAPrograms from '../../messages/en-XA/programs.json';
import enXANotifications from '../../messages/en-XA/notifications.json';
import enXAMembers from '../../messages/en-XA/members.json';
import enXAMembershipOrdinances from '../../messages/en-XA/membership-ordinances.json';
import enXACallings from '../../messages/en-XA/callings.json';
import enXABishopric from '../../messages/en-XA/bishopric.json';
import enXAInterviews from '../../messages/en-XA/interviews.json';
import enXATechnology from '../../messages/en-XA/technology.json';
import enXASpeakers from '../../messages/en-XA/speakers.json';
import enXAReports from '../../messages/en-XA/reports.json';
import enXAAnnouncements from '../../messages/en-XA/announcements.json';
import enXAImports from '../../messages/en-XA/imports.json';
import enXASupport from '../../messages/en-XA/support.json';
import { MESSAGE_CATALOGS } from './messages';

const enUS = { ...enUSCore, ...enUSMeetings, ...enUSPrograms, ...enUSNotifications, ...enUSSupport, ...enUSMembers, ...enUSMembershipOrdinances, ...enUSCallings, ...enUSBishopric, ...enUSInterviews, ...enUSTechnology, ...enUSSpeakers, ...enUSReports, ...enUSAnnouncements, ...enUSImports };
const es = { ...esCore, ...esMeetings, ...esPrograms, ...esNotifications, ...esSupport, ...esMembers, ...esMembershipOrdinances, ...esCallings, ...esBishopric, ...esInterviews, ...esTechnology, ...esSpeakers, ...esReports, ...esAnnouncements, ...esImports };
const enXA = { ...enXACore, ...enXAMeetings, ...enXAPrograms, ...enXANotifications, ...enXASupport, ...enXAMembers, ...enXAMembershipOrdinances, ...enXACallings, ...enXABishopric, ...enXAInterviews, ...enXATechnology, ...enXASpeakers, ...enXAReports, ...enXAAnnouncements, ...enXAImports };

function leafPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe('message catalog structure', () => {
  it('keeps all UI message keys aligned across supported interface locales', () => {
    const expected = leafPaths(enUS).sort();
    expect(leafPaths(es).sort()).toEqual(expected);
    expect(leafPaths(enXA).sort()).toEqual(expected);
  });

  it('merges the expected module-owned namespaces into each runtime catalog', () => {
    const namespaces = ['language', 'settings', 'dashboard', 'meetingEditor', 'print', 'meetings', 'stand', 'meetingForm', 'business', 'notes', 'hymn', 'deleteMeeting', 'membership', 'offline', 'publicProgram', 'navigation', 'auth', 'shell', 'account', 'programs', 'notifications', 'manual', 'supportHymns', 'supportQueue', 'supportAccessRequests', 'supportProvisioning', 'supportUsers', 'supportAuditLog', 'supportConsole', 'members', 'membershipOrdinances', 'callings', 'bishopric', 'interviews', 'technology', 'speakers', 'reports', 'announcements', 'imports'];
    for (const catalog of Object.values(MESSAGE_CATALOGS)) {
      expect(Object.keys(catalog).sort()).toEqual(namespaces.sort());
    }
  });
});
