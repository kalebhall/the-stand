import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_EVENT_TYPES,
  getNotificationEventDefinition,
  type NotificationChannel,
  type NotificationEventType
} from './events';

describe('notification event registry', () => {
  it('contains every planned event exactly once', () => {
    expect(new Set(NOTIFICATION_EVENT_TYPES).size).toBe(NOTIFICATION_EVENT_TYPES.length);
    expect(NOTIFICATION_EVENT_TYPES).toEqual(
      expect.arrayContaining<NotificationEventType>([
        'CALLING_SUGGESTED',
        'CALLING_SUSTAINED',
        'CALLING_SET_APART',
        'CALLING_RELEASED',
        'MEMBER_UPDATED',
        'MEMBERSHIP_IMPORT_FAILED',
        'MEETING_CREATED',
        'MEETING_UPDATED',
        'MEETING_PUBLISHED',
        'MEETING_REPUBLISHED',
        'NOTE_CREATED',
        'NOTE_UPDATED',
        'ACCESS_REQUEST_SUBMITTED',
        'SYSTEM_FAILURE'
      ])
    );
  });

  it('defines safe defaults for meeting publication', () => {
    expect(getNotificationEventDefinition('MEETING_PUBLISHED')).toEqual({
      eventType: 'MEETING_PUBLISHED',
      category: 'MEETINGS',
      label: 'Meeting published',
      defaultChannels: ['IN_APP', 'EMAIL'],
      severity: 'info'
    });
  });

  it('defines independent channel defaults for ordinary meeting changes', () => {
    const definition = getNotificationEventDefinition('MEETING_UPDATED');
    const channels: NotificationChannel[] = definition.defaultChannels;

    expect(definition.category).toBe('MEETINGS');
    expect(channels).toEqual(['IN_APP']);
    expect(channels).not.toContain('EMAIL');
  });

  it('rejects unknown event types at runtime', () => {
    expect(() => getNotificationEventDefinition('NOT_A_REAL_EVENT')).toThrow('Unknown notification event type');
  });
});
