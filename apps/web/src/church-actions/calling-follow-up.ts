import type { CallingStatus } from '@/src/callings/lifecycle';

import type { CallingActionType } from './types';

export type CallingLcrFollowUp = {
  actionType: CallingActionType;
  title: string;
  sourceStatus: CallingStatus;
};

const CALLING_LCR_FOLLOW_UPS: Partial<Record<CallingStatus, CallingLcrFollowUp>> = {
  ASSIGNED: {
    actionType: 'CALLING_RECORDING_REVIEW',
    title: 'Review or record calling in LCR',
    sourceStatus: 'ASSIGNED'
  },
  EXTENDED: {
    actionType: 'CALLING_SUSTAINING_RECORDING',
    title: 'Complete calling sustain/recording follow-up in LCR',
    sourceStatus: 'EXTENDED'
  },
  SET_APART: {
    actionType: 'CALLING_SET_APART_RECORDING',
    title: 'Record set apart in LCR',
    sourceStatus: 'SET_APART'
  },
  TO_BE_RELEASED: {
    actionType: 'CALLING_RELEASE_RECORDING',
    title: 'Record release in LCR',
    sourceStatus: 'TO_BE_RELEASED'
  }
};

export function getCallingLcrFollowUp(status: CallingStatus): CallingLcrFollowUp | null {
  return CALLING_LCR_FOLLOW_UPS[status] ?? null;
}