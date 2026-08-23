import { describe, expect, it } from 'vitest';

import { parseIcsEvents } from '@/src/calendar/ics';

describe('parseIcsEvents', () => {
  it('parses UTC, floating local time, and all-day events with categories', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:event-1',
      'SUMMARY:Ward Council',
      'DESCRIPTION:Discuss plans',
      'DTSTART:20260701T180000Z',
      'DTEND:20260701T190000Z',
      'CATEGORIES:ward,leadership',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:event-2',
      'SUMMARY:Stake Conference',
      'DTSTART;VALUE=DATE:20260710',
      'CATEGORIES:stake',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:event-3',
      'SUMMARY:Ward Youth Activity',
      'DTSTART:20260715T190000',
      'DTEND:20260715T203000',
      'CATEGORIES:youth',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const events = parseIcsEvents(ics);

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      uid: 'event-1',
      title: 'Ward Council',
      description: 'Discuss plans',
      allDay: false,
      tags: ['ward', 'leadership']
    });
    expect(events[1]).toMatchObject({
      uid: 'event-2',
      title: 'Stake Conference',
      allDay: true,
      tags: ['stake']
    });
    expect(events[2]).toMatchObject({
      uid: 'event-3',
      title: 'Ward Youth Activity',
      allDay: false,
      tags: ['youth']
    });
  });
});
