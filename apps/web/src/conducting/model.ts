export const MEETING_STATUSES = ['DRAFT', 'PUBLISHED', 'COMPLETED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_TYPES = ['SACRAMENT', 'FAST_TESTIMONY', 'WARD_CONFERENCE', 'STAKE_CONFERENCE', 'GENERAL_CONFERENCE'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export type IntroductionRoles = {
  presiding: string;
  conducting: string;
  organist: string;
  chorister: string;
  visitingLeaders?: Array<{ name: string; calling: string }>;
};

export type ProgramItem = {
  id: string;
  sequence: number;
  itemType: string;
  title: string | null;
  notes: string | null;
  topic: string | null;
  programNotes: string | null;
  hymnNumber: string | null;
  hymnTitle: string | null;
  hymnLocale?: string;
  introductionRoles: IntroductionRoles | null;
  speakerStatus: string | null;
};

export type Meeting = {
  id: string;
  wardId: string;
  meetingDate: string;
  meetingType: MeetingType;
  status: MeetingStatus;
  programItems: ProgramItem[];
};

export type MeetingContext = {
  userId: string;
  wardId: string;
  meetingId: string;
  meeting: Meeting;
};

export type CoreProgramItemInput = Omit<ProgramItem, 'id' | 'sequence'> & { id?: string; sequence?: number };

export function isMeetingType(value: string): value is MeetingType {
  return MEETING_TYPES.includes(value as MeetingType);
}

export function isMeetingStatus(value: string): value is MeetingStatus {
  return MEETING_STATUSES.includes(value as MeetingStatus);
}

export function canonicalizeProgramItems(items: readonly CoreProgramItemInput[]): ProgramItem[] {
  return items
    .filter((item) => item.itemType.trim().length > 0)
    .map((item, index) => ({
      id: item.id ?? `program-item-${index + 1}`,
      sequence: index + 1,
      itemType: item.itemType.trim(),
      title: item.title?.trim() || null,
      notes: item.notes?.trim() || null,
      topic: item.topic?.trim() || null,
      programNotes: item.programNotes?.trim() || null,
      hymnNumber: item.hymnNumber?.trim() || null,
      hymnTitle: item.hymnTitle?.trim() || null,
      hymnLocale: item.hymnLocale?.trim() || 'en-US',
      introductionRoles: item.introductionRoles ?? null,
      speakerStatus: item.speakerStatus ?? null
    }));
}

export function canonicalizeMeeting(input: Omit<Meeting, 'programItems'> & { programItems: readonly CoreProgramItemInput[] }): Meeting {
  return {
    ...input,
    meetingDate: input.meetingDate.trim(),
    programItems: canonicalizeProgramItems(input.programItems)
  };
}

export function createMeetingContext(userId: string, wardId: string, meeting: Meeting): MeetingContext {
  if (!userId.trim() || !wardId.trim() || !meeting.id.trim() || meeting.wardId !== wardId) {
    throw new Error('Meeting context does not match its authenticated ward.');
  }
  return { userId, wardId, meetingId: meeting.id, meeting };
}

export function transitionMeetingStatus(current: MeetingStatus, action: 'publish' | 'complete' | 'reopen'): MeetingStatus {
  if (action === 'publish' && current === 'DRAFT') return 'PUBLISHED';
  if (action === 'complete' && current === 'PUBLISHED') return 'COMPLETED';
  if (action === 'reopen' && current === 'COMPLETED') return 'PUBLISHED';
  throw new Error(`Cannot ${action} a ${current.toLowerCase()} meeting.`);
}
