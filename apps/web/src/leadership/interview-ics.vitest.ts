import { describe, expect, it } from 'vitest';

import { renderInterviewCalendar } from './interview-ics';

describe('interview calendar export', () => {
  it('renders private schedule metadata as escaped ICS events', () => {
    const calendar = renderInterviewCalendar([
      {
        id: 'interview-1',
        interviewType: 'Temple recommend; renewal',
        memberName: 'Jane, Doe',
        interviewerName: 'Bishop\\Leader',
        scheduledAt: '2026-09-10T18:00:00.000Z'
      }
    ], new Date('2026-09-01T00:00:00.000Z'));

    expect(calendar).toContain('BEGIN:VCALENDAR');
    expect(calendar).toContain('DTSTART:20260910T180000Z');
    expect(calendar).toContain('DTEND:20260910T183000Z');
    expect(calendar).toContain('Temple recommend\\; renewal');
    expect(calendar).toContain('Jane\\, Doe');
    expect(calendar).toContain('Bishop\\\\Leader');
    expect(calendar).toContain('END:VCALENDAR');
  });

  it('rejects invalid event dates', () => {
    expect(() => renderInterviewCalendar([{
      id: 'bad', interviewType: 'Interview', memberName: 'Member', interviewerName: 'Leader', scheduledAt: 'bad'
    }])).toThrow('Invalid interview date');
  });
});
