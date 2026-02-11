export const MEETING_TYPES = ['SACRAMENT', 'FAST_TESTIMONY', 'WARD_CONFERENCE', 'STAKE_CONFERENCE', 'GENERAL_CONFERENCE'] as const;

export type MeetingType = (typeof MEETING_TYPES)[number];

export type ProgramItemInput = {
  id?: string;
  itemType: string;
  title: string;
  notes: string;
  hymnNumber: string;
  hymnTitle: string;
};

export function isMeetingType(value: string): value is MeetingType {
  return MEETING_TYPES.includes(value as MeetingType);
}
