export const LEADERSHIP_MEETING_TYPES = ['BISHOPRIC', 'WARD_COUNCIL', 'MISSIONARY_COORDINATION'] as const;
export type LeadershipMeetingType = (typeof LEADERSHIP_MEETING_TYPES)[number];

export const LEADERSHIP_MEETING_LABELS: Record<LeadershipMeetingType, string> = {
  BISHOPRIC: 'Bishopric meeting',
  WARD_COUNCIL: 'Ward council',
  MISSIONARY_COORDINATION: 'Missionary coordination'
};

export const BISHOPRIC_AGENDA_TEMPLATES = ['BISHOPRIC', 'BISHOPRIC_AND_COUNCIL', 'WARD_COUNCIL', 'MISSIONARY_COORDINATION'] as const;
export type BishopricAgendaTemplate = (typeof BISHOPRIC_AGENDA_TEMPLATES)[number];

export const BISHOPRIC_ACTION_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
export type BishopricActionStatus = (typeof BISHOPRIC_ACTION_STATUSES)[number];

export function validateBishopricActionTransition(current: BishopricActionStatus, next: BishopricActionStatus): string | null {
  if (current === 'COMPLETED' && next !== 'COMPLETED') return 'Completed bishopric actions cannot be reopened.';
  return null;
}

export function isBishopricActionDue(action: { dueDate: string | null; status: BishopricActionStatus }, today: string): boolean {
  return Boolean(action.dueDate && action.dueDate < today && action.status !== 'COMPLETED');
}
