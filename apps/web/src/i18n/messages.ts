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
import tlAnnouncements from '../../messages/tl/announcements.json';
import tlBishopric from '../../messages/tl/bishopric.json';
import tlCallings from '../../messages/tl/callings.json';
import tlCore from '../../messages/tl/core.json';
import tlImports from '../../messages/tl/imports.json';
import tlInterviews from '../../messages/tl/interviews.json';
import tlMeetings from '../../messages/tl/meetings.json';
import tlMembers from '../../messages/tl/members.json';
import tlMembershipOrdinances from '../../messages/tl/membership-ordinances.json';
import tlNotifications from '../../messages/tl/notifications.json';
import tlPrograms from '../../messages/tl/programs.json';
import tlReports from '../../messages/tl/reports.json';
import tlSpeakers from '../../messages/tl/speakers.json';
import tlSupport from '../../messages/tl/support.json';
import tlTechnology from '../../messages/tl/technology.json';
import toAnnouncements from '../../messages/to/announcements.json';
import toBishopric from '../../messages/to/bishopric.json';
import toCallings from '../../messages/to/callings.json';
import toCore from '../../messages/to/core.json';
import toImports from '../../messages/to/imports.json';
import toInterviews from '../../messages/to/interviews.json';
import toMeetings from '../../messages/to/meetings.json';
import toMembers from '../../messages/to/members.json';
import toMembershipOrdinances from '../../messages/to/membership-ordinances.json';
import toNotifications from '../../messages/to/notifications.json';
import toPrograms from '../../messages/to/programs.json';
import toReports from '../../messages/to/reports.json';
import toSpeakers from '../../messages/to/speakers.json';
import toSupport from '../../messages/to/support.json';
import toTechnology from '../../messages/to/technology.json';
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

import type { Locale } from './config';

type MessageCatalog = Record<string, unknown>;

function mergeCatalogs(...catalogs: MessageCatalog[]): MessageCatalog {
  return Object.assign({}, ...catalogs);
}

export const MESSAGE_CATALOGS: Record<Locale, MessageCatalog> = {
  'en-US': mergeCatalogs(enUSCore, enUSMeetings, enUSPrograms, enUSNotifications, enUSSupport, enUSMembers, enUSMembershipOrdinances, enUSCallings, enUSBishopric, enUSInterviews, enUSTechnology, enUSSpeakers, enUSReports, enUSAnnouncements, enUSImports),
  es: mergeCatalogs(esCore, esMeetings, esPrograms, esNotifications, esSupport, esMembers, esMembershipOrdinances, esCallings, esBishopric, esInterviews, esTechnology, esSpeakers, esReports, esAnnouncements, esImports),
  tl: mergeCatalogs(tlAnnouncements, tlBishopric, tlCallings, tlCore, tlImports, tlInterviews, tlMeetings, tlMembers, tlMembershipOrdinances, tlNotifications, tlPrograms, tlReports, tlSpeakers, tlSupport, tlTechnology),
  to: mergeCatalogs(toAnnouncements, toBishopric, toCallings, toCore, toImports, toInterviews, toMeetings, toMembers, toMembershipOrdinances, toNotifications, toPrograms, toReports, toSpeakers, toSupport, toTechnology)
};

export const PSEUDO_MESSAGE_CATALOG = mergeCatalogs(
  enXACore,
  enXAMeetings,
  enXAPrograms,
  enXANotifications,
  enXASupport,
  enXAMembers,
  enXAMembershipOrdinances,
  enXACallings,
  enXABishopric,
  enXAInterviews,
  enXATechnology,
  enXASpeakers,
  enXAReports,
  enXAAnnouncements,
  enXAImports
);

export function loadMessages(locale: Locale): MessageCatalog {
  return MESSAGE_CATALOGS[locale];
}
