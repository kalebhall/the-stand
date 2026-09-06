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
  speakerStatus?: SpeakerStatus;
};

export const SPEAKER_STATUSES = ['PLANNED', 'INVITED', 'ACCEPTED', 'CONFIRMED', 'COMPLETED'] as const;
export type SpeakerStatus = (typeof SPEAKER_STATUSES)[number];

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

export function validateProgramItemsForMeetingType(meetingType: string, items: Pick<ProgramItemInput, 'itemType'>[]): string | null {
  if (meetingType !== 'FAST_TESTIMONY') return null;
  const forbidden = items.map((item) => item.itemType.toUpperCase()).filter((itemType) => itemType === 'SPEAKER' || itemType === 'SPECIAL_HYMN');
  return forbidden.length ? 'Fast-and-testimony meetings cannot include assigned speakers or special musical selections.' : null;
}

export function validateSpeakerStatusTransition(
  current: SpeakerStatus,
  next: SpeakerStatus,
  topic?: string | null
): string | null {
  if (current === next) return null;

  const currentIndex = SPEAKER_STATUSES.indexOf(current);
  const nextIndex = SPEAKER_STATUSES.indexOf(next);
  if (nextIndex !== currentIndex + 1) {
    return 'Speaker status must advance one step at a time.';
  }

  if (next === 'CONFIRMED' && !topic?.trim()) {
    return 'Speaker topic is required before confirmation.';
  }

  return null;
}

export function getProgramItemLabel(itemType: string): string {
  if (itemType.toUpperCase() === 'ORGANIST_PIANIST') return 'Organist / Pianist';

  return itemType.replaceAll('_', ' ');
}
