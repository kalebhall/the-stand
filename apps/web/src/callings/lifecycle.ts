export const CALLING_STATUS = {
  PROPOSED: 'PROPOSED',
  EXTENDED: 'EXTENDED',
  SUSTAINED: 'SUSTAINED',
  SET_APART: 'SET_APART'
} as const;

export type CallingStatus = (typeof CALLING_STATUS)[keyof typeof CALLING_STATUS];

const ALLOWED_TRANSITIONS: Record<CallingStatus, CallingStatus[]> = {
  PROPOSED: ['EXTENDED'],
  EXTENDED: ['SUSTAINED'],
  SUSTAINED: ['SET_APART'],
  SET_APART: []
};

export function canTransitionCallingStatus(fromStatus: CallingStatus, toStatus: CallingStatus): boolean {
  return ALLOWED_TRANSITIONS[fromStatus].includes(toStatus);
}
