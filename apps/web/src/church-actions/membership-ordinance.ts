export type MembershipOrdinanceActionType =
  | 'WELCOME_NEW_MEMBER'
  | 'RECOGNIZE_BAPTIZED_CHILD'
  | 'BAPTISM_CONFIRMATION_FOLLOW_UP'
  | 'BABY_BLESSING'
  | 'PRIESTHOOD_ORDINATION'
  | 'PRIESTHOOD_ADVANCEMENT';

export type MembershipOrdinanceStatus = 'pending' | 'action_needed' | 'completed';
export type PriesthoodOffice = 'DEACON' | 'TEACHER' | 'PRIEST' | 'ELDER' | 'HIGH_PRIEST' | 'UNKNOWN';

export type MembershipOrdinanceActionRow = {
  id: string;
  meetingId: string;
  meetingDate: string;
  meetingType: string;
  memberName: string;
  actionType: MembershipOrdinanceActionType;
  priesthoodOffice?: PriesthoodOffice | null;
  status: MembershipOrdinanceStatus;
  plannedDate: string | null;
  responsibleLeader: string | null;
  interviewStatus: 'not_required' | 'needed' | 'scheduled' | 'completed';
  approvalConfirmed?: boolean;
  presentingLeader?: string | null;
  performingPriesthoodHolder?: string | null;
  ordinanceDate?: string | null;
  baptismDate?: string | null;
  confirmationDate?: string | null;
  baptismStatus?: 'planned' | 'completed' | 'cancelled' | null;
  confirmationStatus?: 'planned' | 'completed' | 'cancelled' | null;
  lcrFollowUpStatus: 'not_applicable' | 'needed' | 'completed';
  recordFormNeeded: boolean;
  handoffDate: string | null;
  officialRecordUpdatedBy: string | null;
  certificateOrFormDelivered: boolean;
  officialSystemFollowUpStatus: 'not_started' | 'in_progress' | 'completed' | 'not_applicable';
  officialSystemReferenceUrl: string | null;
};

export const MEMBERSHIP_ORDINANCE_ACTION_LABELS: Record<MembershipOrdinanceActionType, string> = {
  WELCOME_NEW_MEMBER: 'Welcome new member',
  RECOGNIZE_BAPTIZED_CHILD: 'Recognize baptized child',
  BAPTISM_CONFIRMATION_FOLLOW_UP: 'Baptism and confirmation follow-up',
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

export const PRIESTHOOD_OFFICE_LABELS: Record<PriesthoodOffice, string> = {
  DEACON: 'Deacon',
  TEACHER: 'Teacher',
  PRIEST: 'Priest',
  ELDER: 'Elder',
  HIGH_PRIEST: 'High priest',
  UNKNOWN: 'Unknown during planning'
};

export function validatePriesthoodOffice(actionType: string, office: unknown): office is PriesthoodOffice | null {
  if (!actionType.startsWith('PRIESTHOOD_')) return office === null || office === undefined || office === '';
  if (office === null || office === undefined || office === '') return true;
  if (typeof office !== 'string' || !(office in PRIESTHOOD_OFFICE_LABELS)) return false;
  return actionType !== 'PRIESTHOOD_ADVANCEMENT' || office === 'UNKNOWN' || office !== 'DEACON';
}

export function isWardSacramentPriesthoodActionAllowed(meetingType: string, office: PriesthoodOffice | null): boolean {
  return meetingType !== 'SACRAMENT' || office === null || office === 'UNKNOWN' || (office !== 'ELDER' && office !== 'HIGH_PRIEST');
}

export function getMembershipOrdinanceGroup(action: MembershipOrdinanceActionRow, today: string): MembershipOrdinanceActionGroup {
  if (action.status === 'completed' && action.lcrFollowUpStatus !== 'needed') return 'completed';
  if (action.status === 'action_needed' || action.interviewStatus === 'needed' || action.interviewStatus === 'scheduled' || action.lcrFollowUpStatus === 'needed') {
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

export function matchesMembershipOrdinanceFilters(
  action: MembershipOrdinanceActionRow,
  filters: { query?: string; actionType?: string; status?: string; group?: string; followup?: string },
  today: string
): boolean {
  const query = filters.query?.trim().toLowerCase();
  if (query && !`${action.memberName} ${action.responsibleLeader ?? ''} ${action.meetingType}`.toLowerCase().includes(query)) return false;
  if (filters.actionType && filters.actionType !== 'all' && action.actionType !== filters.actionType) return false;
  if (filters.status && filters.status !== 'all' && action.status !== filters.status) return false;
  if (filters.group && filters.group !== 'all' && getMembershipOrdinanceGroup(action, today) !== filters.group) return false;
  if (filters.followup === 'interview' && !['needed', 'scheduled'].includes(action.interviewStatus)) return false;
  if (filters.followup === 'lcr' && !(action.lcrFollowUpStatus === 'needed' && action.status === 'completed')) return false;
  if (filters.followup === 'official-record' && !(action.recordFormNeeded && ['not_started', 'in_progress'].includes(action.officialSystemFollowUpStatus))) return false;
  if (filters.followup === 'overdue' && !(action.plannedDate && action.plannedDate < today && action.status !== 'completed')) return false;
  return true;
}
