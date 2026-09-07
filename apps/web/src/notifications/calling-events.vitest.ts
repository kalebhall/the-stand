import { describe, expect, it } from 'vitest';

import { getCallingNotificationEventType } from './calling-events';

describe('calling notification event mapping', () => {
  it.each([
    ['ASSIGNED', 'CALLING_ASSIGNMENT_CHANGED'],
    ['EXTENDED', 'CALLING_EXTENDED'],
    ['SUSTAINED', 'CALLING_SUSTAINED'],
    ['SET_APART', 'CALLING_SET_APART'],
    ['TO_BE_RELEASED', 'CALLING_RELEASED']
  ] as const)('maps %s to %s', (status, eventType) => {
    expect(getCallingNotificationEventType(status)).toBe(eventType);
  });

  it('does not create an event for terminal release state', () => {
    expect(getCallingNotificationEventType('PROPOSED')).toBeNull();
  });
});
