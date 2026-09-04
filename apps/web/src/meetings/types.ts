export const MEETING_TYPES = ['SACRAMENT', 'FAST_TESTIMONY', 'WARD_CONFERENCE', 'STAKE_CONFERENCE', 'GENERAL_CONFERENCE'] as const;

export type MeetingType = (typeof MEETING_TYPES)[number];

export type ProgramItemInput = {
  id?: string;
  itemType: string;
  title: string;
  notes: string;
  topic?: string;
  programNotes?: string;
  hymnNumber: string;
  hymnTitle: string;
};

export const INTRODUCTION_ITEM_TYPES = new Set([
  'PRESIDING',
  'CONDUCTING',
  'ORGANIST_PIANIST',
  'CHORISTER'
]);

export function isIntroductionItemType(itemType: string): boolean {
  return INTRODUCTION_ITEM_TYPES.has(itemType.toUpperCase());
}

export function isMeetingType(value: string): value is MeetingType {
  return MEETING_TYPES.includes(value as MeetingType);
}

export function getProgramItemLabel(itemType: string): string {
  if (itemType.toUpperCase() === 'ORGANIST_PIANIST') return 'Organist / Pianist';

  return itemType.replaceAll('_', ' ');
}
