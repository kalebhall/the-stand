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
  introductionRoles?: IntroductionRoles;
};

export type IntroductionRoles = {
  presiding: string;
  conducting: string;
  organist: string;
  chorister: string;
  visitingLeaders?: VisitingStakeLeader[];
};

export type VisitingStakeLeader = {
  name: string;
  calling: string;
};

export const INTRODUCTION_ITEM_TYPE = 'INTRODUCTION';

export function isMeetingType(value: string): value is MeetingType {
  return MEETING_TYPES.includes(value as MeetingType);
}

export function getProgramItemLabel(itemType: string): string {
  if (itemType.toUpperCase() === 'ORGANIST_PIANIST') return 'Organist / Pianist';

  return itemType.replaceAll('_', ' ');
}
