import { describe, expect, it } from 'vitest';

import { getNotificationEventDefinition } from './events';
import { getRecipientPolicyKey } from './recipients';
import { formatUserNotification } from './format';

describe('technology reminder notifications', () => {
  it('uses private manager-only in-app reminder policy', () => {
    const definition = getNotificationEventDefinition('MEETING_TECHNOLOGY_REMINDER');
    expect(definition.category).toBe('REMINDERS');
    expect(definition.defaultChannels).toEqual(['IN_APP']);
    expect(getRecipientPolicyKey('MEETING_TECHNOLOGY_REMINDER')).toBe('CALLING_MANAGERS');
  });

  it('links reminder to technology checklist without private payload fields', () => {
    const notification = formatUserNotification({
      wardId: 'ward-1',
      sourceEventId: 'event-1',
      eventType: 'MEETING_TECHNOLOGY_REMINDER',
      aggregateType: 'meeting',
      aggregateId: 'meeting-1',
      recipientUserId: 'user-1',
      payload: { meetingDate: '2026-09-06', meetingType: 'SACRAMENT', subject: '2026-09-06 SACRAMENT', streamPassword: 'never' }
    });
    expect(notification.targetUrl).toBe('/technology');
    expect(notification.details).toEqual({ meetingDate: '2026-09-06' });
    expect(notification.details).not.toHaveProperty('streamPassword');
  });
});
