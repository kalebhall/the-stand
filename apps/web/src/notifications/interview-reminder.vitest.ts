import { describe, expect, it } from 'vitest';

import { getNotificationEventDefinition } from './events';
import { getRecipientPolicyKey } from './recipients';
import { approvedTargetUrl, formatUserNotification } from './format';

describe('interview reminder notifications', () => {
  it('defines private operational reminder policy', () => {
    const definition = getNotificationEventDefinition('INTERVIEW_REMINDER');
    expect(definition.category).toBe('REMINDERS');
    expect(definition.defaultChannels).toEqual(['IN_APP']);
    expect(getRecipientPolicyKey('INTERVIEW_REMINDER')).toBe('CALLING_MANAGERS');
  });

  it('formats safe interview metadata and approved target', () => {
    const notification = formatUserNotification({
      wardId: 'ward-1',
      sourceEventId: 'event-1',
      eventType: 'INTERVIEW_REMINDER',
      aggregateType: 'scheduled_interview',
      aggregateId: 'interview-1',
      recipientUserId: 'user-1',
      payload: {
        memberName: 'Alex Hall',
        interviewType: 'Temple recommend',
        interviewerName: 'Bishop Hall',
        scheduledAt: '2026-09-06T10:00:00Z',
        privateNote: 'must never appear'
      }
    });

    expect(notification.targetUrl).toBe('/interviews');
    expect(notification.details).toEqual({
      memberName: 'Alex Hall',
      interviewType: 'Temple recommend',
      interviewerName: 'Bishop Hall',
      scheduledAt: '2026-09-06T10:00:00Z'
    });
    expect(notification.details).not.toHaveProperty('privateNote');
    expect(approvedTargetUrl('scheduled_interview', 'interview-1')).toBe('/interviews');
  });
});
