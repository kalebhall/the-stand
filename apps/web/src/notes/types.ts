export const NOTE_VISIBILITIES = ['PUBLIC', 'LEADERSHIP', 'PRIVATE'] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

export const NOTE_TARGET_TYPES = ['MEMBER', 'MEETING', 'PROGRAM_ITEM'] as const;
export type NoteTargetType = (typeof NOTE_TARGET_TYPES)[number];

export type NoteTarget =
  | { type: 'MEMBER'; memberId: string }
  | { type: 'MEETING'; meetingId: string }
  | { type: 'PROGRAM_ITEM'; programItemId: string };

export function isNoteVisibility(value: unknown): value is NoteVisibility {
  return typeof value === 'string' && NOTE_VISIBILITIES.includes(value as NoteVisibility);
}

export function isNoteTarget(value: unknown): value is NoteTarget {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;

  if (candidate.type === 'MEMBER') return typeof candidate.memberId === 'string' && candidate.memberId.trim().length > 0;
  if (candidate.type === 'MEETING') return typeof candidate.meetingId === 'string' && candidate.meetingId.trim().length > 0;
  if (candidate.type === 'PROGRAM_ITEM') return typeof candidate.programItemId === 'string' && candidate.programItemId.trim().length > 0;
  return false;
}

export function noteTargetId(target: NoteTarget): string {
  switch (target.type) {
    case 'MEMBER':
      return target.memberId;
    case 'MEETING':
      return target.meetingId;
    case 'PROGRAM_ITEM':
      return target.programItemId;
  }
}
