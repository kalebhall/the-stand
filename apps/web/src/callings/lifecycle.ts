export const CALLING_STATUS = {
  ASSIGNED: 'ASSIGNED',
  PROPOSED: 'PROPOSED',
  EXTENDED: 'EXTENDED',
  SUSTAINED: 'SUSTAINED',
  SET_APART: 'SET_APART',
  TO_BE_RELEASED: 'TO_BE_RELEASED'
} as const;

export type CallingStatus = (typeof CALLING_STATUS)[keyof typeof CALLING_STATUS];

const ALLOWED_TRANSITIONS: Record<CallingStatus, CallingStatus[]> = {
  ASSIGNED: ['TO_BE_RELEASED'],
  PROPOSED: ['EXTENDED', 'ASSIGNED', 'TO_BE_RELEASED'],
  EXTENDED: ['SUSTAINED', 'ASSIGNED', 'TO_BE_RELEASED'],
  SUSTAINED: ['SET_APART', 'ASSIGNED', 'TO_BE_RELEASED'],
  SET_APART: ['ASSIGNED', 'TO_BE_RELEASED'],
  TO_BE_RELEASED: []
};

export function canTransitionCallingStatus(fromStatus: CallingStatus, toStatus: CallingStatus): boolean {
  return ALLOWED_TRANSITIONS[fromStatus].includes(toStatus);
}
