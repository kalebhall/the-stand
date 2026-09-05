export type MembershipOrdinanceActionType =
  | 'WELCOME_NEW_MEMBER'
  | 'BABY_BLESSING'
  | 'PRIESTHOOD_ORDINATION'
  | 'PRIESTHOOD_ADVANCEMENT';

export type MembershipOrdinanceStatus = 'pending' | 'action_needed' | 'completed';

export type MembershipOrdinanceActionRow = {
  id: string;
  meetingId: string;
  meetingDate: string;
  meetingType: string;
  memberName: string;
  actionType: MembershipOrdinanceActionType;
  status: MembershipOrdinanceStatus;
  plannedDate: string | null;
  responsibleLeader: string | null;
  interviewStatus: 'not_required' | 'needed' | 'scheduled' | 'completed';
  lcrFollowUpStatus: 'not_applicable' | 'needed' | 'completed';
};

export const MEMBERSHIP_ORDINANCE_ACTION_LABELS: Record<MembershipOrdinanceActionType, string> = {
  WELCOME_NEW_MEMBER: 'Welcome new member',
  BABY_BLESSING: 'Baby blessing',
  PRIESTHOOD_ORDINATION: 'Priesthood ordination',
  PRIESTHOOD_ADVANCEMENT: 'Priesthood advancement'
};

export const MEMBERSHIP_ORDINANCE_STATUS_LABELS: Record<MembershipOrdinanceStatus, string> = {
  pending: 'Planned',
  action_needed: 'Action needed',
  completed: 'Completed'
};

export type MembershipOrdinanceActionGroup = 'needs_attention' | 'upcoming' | 'completed';

export function getMembershipOrdinanceActionLabel(actionType: MembershipOrdinanceActionType): string {
  return MEMBERSHIP_ORDINANCE_ACTION_LABELS[actionType];
}

export function getMembershipOrdinanceGroup(action: MembershipOrdinanceActionRow, today: string): MembershipOrdinanceActionGroup {
  if (action.status === 'completed' && action.lcrFollowUpStatus !== 'needed') return 'completed';
  if (action.status === 'action_needed' || action.interviewStatus === 'needed' || action.lcrFollowUpStatus === 'needed') {
    return 'needs_attention';
  }
  if (action.plannedDate && action.plannedDate < today) return 'needs_attention';
  return 'upcoming';
}

export function getMembershipOrdinanceNextStep(action: MembershipOrdinanceActionRow): string {
  if (action.lcrFollowUpStatus === 'needed') return 'Update LCR';
  if (action.status === 'action_needed') return 'Complete action';
  if (action.interviewStatus === 'needed') return 'Schedule interview';
  if (action.interviewStatus === 'scheduled') return 'Complete interview';
  if (action.status === 'pending') return 'Present in meeting';
  return 'Complete';
}
