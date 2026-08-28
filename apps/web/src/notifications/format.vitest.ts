import { describe, expect, it } from 'vitest';

import { approvedTargetUrl, formatUserNotification } from './format';

describe('notification formatting', () => {
  it('formats safe details and approved internal target URLs', () => {
    expect(formatUserNotification({
      wardId: 'ward-1',
      sourceEventId: 'event-1',
      eventType: 'MEETING_PUBLISHED',
      aggregateType: 'meeting',
      aggregateId: 'meeting-1',
      payload: {
        meetingDate: '2026-08-30',
        subject: 'Sacrament meeting',
        privateNoteText: 'must never be copied'
      },
      recipientUserId: 'user-1'
    })).toEqual({
      wardId: 'ward-1',
      recipientUserId: 'user-1',
      sourceEventId: 'event-1',
      eventType: 'MEETING_PUBLISHED',
      aggregateType: 'meeting',
      aggregateId: 'meeting-1',
      title: 'Meeting published',
      summary: 'Meeting published: Sacrament meeting',
      details: { meetingDate: '2026-08-30' },
      severity: 'info',
      targetUrl: '/meetings/meeting-1/edit'
    });
  });

  it('does not create arbitrary or external target URLs', () => {
    expect(approvedTargetUrl('unknown', 'aggregate-1')).toBeNull();
    expect(approvedTargetUrl('meeting', 'aggregate-1')).toBe('/meetings/aggregate-1/edit');
  });
});
