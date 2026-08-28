import { describe, expect, it } from 'vitest';

import { parseIcsEvents } from '@/src/calendar/ics';

describe('parseIcsEvents', () => {
  it('parses UTC and all-day events with categories', () => {
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
      'END:VCALENDAR'
    ].join('\r\n');

    const events = parseIcsEvents(ics);

    expect(events).toHaveLength(2);
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
  });

  it('treats floating Church feed times as local wall-clock values and decodes text', () => {
    const events = parseIcsEvents([
      'BEGIN:VEVENT',
      'UID:floating-1',
      'SUMMARY:Ward Council\\, Planning',
      'DESCRIPTION:Line one\\nLine two\\; detail',
      'LOCATION:Relief Society room',
      'DTSTART:20260701T180000',
      'LAST-MODIFIED:20260630T120000Z',
      'END:VEVENT'
    ].join('\n'));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Ward Council, Planning',
      description: 'Line one\nLine two; detail',
      startsAt: new Date(2026, 6, 1, 18, 0, 0).toISOString(),
      sourceUpdatedAt: '2026-06-30T12:00:00.000Z'
    });
  });

  it('unfolds continuation lines and ignores incomplete events', () => {
    const events = parseIcsEvents([
      'BEGIN:VEVENT',
      'UID:unfolded',
      'SUMMARY:Long summary',
      'DESCRIPTION:First part',
      ' second part',
      'DTSTART:20260701T180000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:missing-summary',
      'DTSTART:20260701T180000Z',
      'END:VEVENT'
    ].join('\r\n'));

    expect(events).toHaveLength(1);
    expect(events[0].description).toBe('First partsecond part');
  });
});
