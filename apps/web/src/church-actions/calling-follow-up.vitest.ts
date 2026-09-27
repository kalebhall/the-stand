import { describe, expect, it } from 'vitest';

import { getCallingLcrFollowUp } from './calling-follow-up';

describe('calling LCR follow-up mapping', () => {
  it.each([
    ['ASSIGNED', 'CALLING_RECORDING_REVIEW'],
    ['EXTENDED', 'CALLING_SUSTAINING_RECORDING'],
    ['SET_APART', 'CALLING_SET_APART_RECORDING'],
    ['TO_BE_RELEASED', 'CALLING_RELEASE_RECORDING']
  ] as const)('maps %s to %s', (status, actionType) => {
    expect(getCallingLcrFollowUp(status)).toMatchObject({ actionType, sourceStatus: status });
  });

  it.each(['PROPOSED', 'SUSTAINED'] as const)('does not create an LCR follow-up for %s alone', (status) => {
    expect(getCallingLcrFollowUp(status)).toBeNull();
  });
});