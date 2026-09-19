import enUS from '../../messages/en-US.json';
import es from '../../messages/es.json';
import type { MeetingRenderLabels } from '../meetings/render';
import { resolveLocale, type Locale } from './config';

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
    item_INTRODUCTION: string;
    item_ANNOUNCEMENT: string;
    item_OPENING_HYMN: string;
    item_INVOCATION: string;
    item_WARD_AND_STAKE_BUSINESS: string;
    item_SACRAMENT_HYMN: string;
    item_SACRAMENT: string;
    item_SPEAKER: string;
    item_REST_HYMN: string;
    item_CLOSING_HYMN: string;
    item_BENEDICTION: string;
    item_TESTIMONIES: string;
  };
  meetings: {
    type_SACRAMENT: string;
    type_FAST_TESTIMONY: string;
    type_WARD_CONFERENCE: string;
    type_STAKE_CONFERENCE: string;
    type_GENERAL_CONFERENCE: string;
    type_UNKNOWN: string;
  };
};

const messages: Record<Locale, PublicProgramMessages> = {
  'en-US': enUS,
  es
};

const PRINT_ITEM_KEYS = [
  'INTRODUCTION',
  'ANNOUNCEMENT',
  'OPENING_HYMN',
  'INVOCATION',
  'WARD_AND_STAKE_BUSINESS',
  'SACRAMENT_HYMN',
  'SACRAMENT',
  'SPEAKER',
  'REST_HYMN',
  'CLOSING_HYMN',
  'BENEDICTION',
  'TESTIMONIES'
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
    meetingTypeLabel: catalog.meetings[meetingTypeKey],
    itemLabels: Object.fromEntries(PRINT_ITEM_KEYS.map((itemType) => [itemType, print[`item_${itemType}` as keyof typeof print]]))
  };
}

export function resolvePublicLocale(cookieLocale: string | null | undefined): Locale {
  return resolveLocale(cookieLocale);
}

export function buildPublicProgramEmptyHtml(locale: Locale): string {
  const copy = messages[locale].publicProgram;
  return `<main class="public-program mx-auto max-w-3xl space-y-2 p-4 sm:p-8" aria-labelledby="public-program-title"><h1 id="public-program-title" class="text-2xl font-semibold">${copy.title}</h1><p class="text-sm text-muted-foreground">${copy.body}</p></main>`;
}
