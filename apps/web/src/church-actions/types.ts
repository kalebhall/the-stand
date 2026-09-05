export const CHURCH_ACTION_FAMILIES = ['CALLING', 'MEMBERSHIP', 'PRIESTHOOD'] as const;
export type ChurchActionFamily = (typeof CHURCH_ACTION_FAMILIES)[number];

export const FOLLOW_UP_STATUSES = [
  'PLANNED',
  'INTERVIEW_NEEDED',
  'INTERVIEW_COMPLETE',
  'SCHEDULED',
  'ANNOUNCED',
  'ACTION_NEEDED',
  'COMPLETED',
  'CANCELLED'
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const INTERVIEW_STATUSES = ['NOT_REQUIRED', 'NEEDED', 'SCHEDULED', 'COMPLETED'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const LCR_FOLLOW_UP_STATUSES = ['NOT_APPLICABLE', 'NEEDED', 'COMPLETED'] as const;
export type LcrFollowUpStatus = (typeof LCR_FOLLOW_UP_STATUSES)[number];

export const MEMBERSHIP_ACTION_TYPES = ['WELCOME_NEW_MEMBER', 'RECOGNIZE_BAPTIZED_CHILD', 'BABY_BLESSING'] as const;
export type MembershipActionType = (typeof MEMBERSHIP_ACTION_TYPES)[number];

export const PRIESTHOOD_ACTION_TYPES = ['PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT'] as const;
export type PriesthoodActionType = (typeof PRIESTHOOD_ACTION_TYPES)[number];

export type ChurchActionType = MembershipActionType | PriesthoodActionType;

export type ChurchAction =
  | {
      family: 'MEMBERSHIP';
      actionType: MembershipActionType;
      status: FollowUpStatus;
      interviewStatus: InterviewStatus;
      lcrFollowUpStatus: 'NOT_APPLICABLE';
    }
  | {
      family: 'PRIESTHOOD';
      actionType: PriesthoodActionType;
      status: FollowUpStatus;
      interviewStatus: Exclude<InterviewStatus, 'NOT_REQUIRED'>;
      lcrFollowUpStatus: LcrFollowUpStatus;
    };

const FOLLOW_UP_TRANSITIONS: Record<FollowUpStatus, readonly FollowUpStatus[]> = {
  PLANNED: ['INTERVIEW_NEEDED', 'SCHEDULED', 'CANCELLED'],
  INTERVIEW_NEEDED: ['INTERVIEW_COMPLETE', 'CANCELLED'],
  INTERVIEW_COMPLETE: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ANNOUNCED', 'ACTION_NEEDED', 'COMPLETED', 'CANCELLED'],
  ANNOUNCED: ['ACTION_NEEDED', 'COMPLETED'],
  ACTION_NEEDED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: []
};

export function getAllowedFollowUpTransitions(status: FollowUpStatus): readonly FollowUpStatus[] {
  return FOLLOW_UP_TRANSITIONS[status];
}

export function canTransitionFollowUp(status: FollowUpStatus, nextStatus: FollowUpStatus): boolean {
  return FOLLOW_UP_TRANSITIONS[status].includes(nextStatus);
}

export function requiresInterview(family: ChurchActionFamily, actionType: ChurchActionType): boolean {
  return family === 'PRIESTHOOD' && PRIESTHOOD_ACTION_TYPES.includes(actionType as PriesthoodActionType);
}

export function requiresLcrFollowUp(family: ChurchActionFamily, actionType: ChurchActionType): boolean {
  return family === 'PRIESTHOOD' && PRIESTHOOD_ACTION_TYPES.includes(actionType as PriesthoodActionType);
}
