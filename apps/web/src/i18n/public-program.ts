import type { MeetingRenderLabels } from '../meetings/render';
import type { StandRenderLabels } from '../stand/render';
import { getDefaultStandTemplate } from '../stand/default-template';
import { isSupportedLocale, resolveLocale, type Locale } from './config';
import { MESSAGE_CATALOGS } from './messages';

type PublicProgramMessages = {
  publicProgram: {
    title: string;
    body: string;
  };
  print: {
    programTitle: string;
    announcements: string;
    introduction: string;
    presiding: string;
    conducting: string;
    organistPianist: string;
    chorister: string;
    sacramentPrayers: string;
    qrDigitalProgram: string;
    qrCode: string;
    documentRegion: string;
    documentColumn: string;
    item_INTRODUCTION: string;
    item_PRESIDING: string;
    item_CONDUCTING: string;
    item_ORGANIST_PIANIST: string;
    item_CHORISTER: string;
    item_WELCOME: string;
    item_ANNOUNCEMENT: string;
    item_OPENING_HYMN: string;
    item_HYMN: string;
    item_INVOCATION: string;
    item_OPENING_PRAYER: string;
    item_WARD_AND_STAKE_BUSINESS: string;
    item_SACRAMENT_HYMN: string;
    item_SACRAMENT: string;
    item_SPEAKER: string;
    item_REST_HYMN: string;
    item_CLOSING_HYMN: string;
    item_BENEDICTION: string;
    item_CLOSING_PRAYER: string;
    item_TESTIMONIES: string;
    item_SPECIAL_HYMN: string;
    item_SPECIAL_MUSICAL_NUMBER: string;
    item_SUSTAINING: string;
    item_RELEASE: string;
  };
  meetings: Record<string, string>;
  stand: Record<string, string>;
};

const messages = MESSAGE_CATALOGS as Record<Locale, PublicProgramMessages>;

const PRINT_ITEM_KEYS = [
  'INTRODUCTION',
  'PRESIDING',
  'CONDUCTING',
  'ORGANIST_PIANIST',
  'CHORISTER',
  'WELCOME',
  'ANNOUNCEMENT',
  'OPENING_HYMN',
  'HYMN',
  'INVOCATION',
  'OPENING_PRAYER',
  'WARD_AND_STAKE_BUSINESS',
  'SACRAMENT_HYMN',
  'SACRAMENT',
  'SPEAKER',
  'REST_HYMN',
  'CLOSING_HYMN',
  'BENEDICTION',
  'CLOSING_PRAYER',
  'TESTIMONIES',
  'SPECIAL_HYMN',
  'SPECIAL_MUSICAL_NUMBER',
  'SUSTAINING',
  'RELEASE'
] as const;

const MEETING_TYPE_KEYS = {
  SACRAMENT: 'type_SACRAMENT',
  FAST_TESTIMONY: 'type_FAST_TESTIMONY',
  WARD_CONFERENCE: 'type_WARD_CONFERENCE',
  STAKE_CONFERENCE: 'type_STAKE_CONFERENCE',
  GENERAL_CONFERENCE: 'type_GENERAL_CONFERENCE'
} as const;

export function getPublicProgramRenderLabels(locale: Locale, meetingType: string): MeetingRenderLabels {
  const catalog = messages[locale];
  const print = catalog.print;
  const meetingTypeKey = MEETING_TYPE_KEYS[meetingType as keyof typeof MEETING_TYPE_KEYS] ?? 'type_UNKNOWN';

  return {
    programTitle: print.programTitle,
    announcements: print.announcements,
    introduction: print.introduction,
    presiding: print.presiding,
    conducting: print.conducting,
    organistPianist: print.organistPianist,
    chorister: print.chorister,
    sacramentPrayers: print.sacramentPrayers,
    qrDigitalProgram: print.qrDigitalProgram,
    qrCode: print.qrCode,
    documentRegion: print.documentRegion,
    documentColumn: print.documentColumn,
    meetingTypeLabel: catalog.meetings[meetingTypeKey],
    itemLabels: Object.fromEntries(PRINT_ITEM_KEYS.map((itemType) => [itemType, print[`item_${itemType}` as keyof typeof print]]))
  };
}

export function resolvePublicLocale(cookieLocale: string | null | undefined, wardDefaultLocale?: string | null): Locale {
  return isSupportedLocale(cookieLocale) ? cookieLocale : resolveLocale(wardDefaultLocale);
}

export function getStandRenderLabels(locale: Locale): StandRenderLabels {
  const stand = messages[locale].stand;
  return {
    introduction: stand.introduction,
    presiding: stand.presiding,
    conducting: stand.conducting,
    organistPianist: stand.organistPianist,
    chorister: stand.chorister,
    unassigned: stand.unassigned,
    visitingStakeLeader: stand.visitingStakeLeader,
    visitingPresidingAuthority: stand.visitingLeaderTypePresidingAuthority,
    visitingHighCouncilor: stand.visitingLeaderTypeHighCouncilor,
    visitingGeneralOfficer: stand.visitingLeaderTypeGeneralOfficer,
    visitingOtherLeader: stand.visitingLeaderTypeOther,
    defaultTemplates: getDefaultStandTemplate(locale),
    itemLabels: Object.fromEntries(
      PRINT_ITEM_KEYS.map((itemType) => [itemType, stand[`item_${itemType}`] ?? itemType.replaceAll('_', ' ')])
    )
  };
}

export function buildPublicProgramEmptyHtml(locale: Locale): string {
  const copy = messages[locale].publicProgram;
  return `<main class="public-program mx-auto max-w-3xl space-y-2 p-4 sm:p-8" aria-labelledby="public-program-title"><h1 id="public-program-title" class="text-2xl font-semibold">${copy.title}</h1><p class="text-sm text-muted-foreground">${copy.body}</p></main>`;
}
