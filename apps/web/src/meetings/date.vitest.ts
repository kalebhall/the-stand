import { describe, expect, it } from 'vitest';

import { formatDateTimeForDisplay, formatMeetingDateForDisplay, getNextSunday, toYyyyMmDd } from './date';

describe('meetings date helpers', () => {
  it('toYyyyMmDd formats dates consistently', () => {
    expect(toYyyyMmDd('2026-08-22')).toBe('2026-08-22');
    expect(toYyyyMmDd(new Date(2026, 7, 22))).toBe('2026-08-22');
  });

  it('getNextSunday returns the current date if it is Sunday', () => {
    // 2026-08-23 is Sunday
    const sunday = new Date(2026, 7, 23, 12, 0, 0);
    expect(getNextSunday(sunday)).toBe('2026-08-23');
  });

  it('getNextSunday returns the upcoming Sunday for weekdays', () => {
    // 2026-08-22 is Saturday
    const saturday = new Date(2026, 7, 22, 12, 0, 0);
    expect(getNextSunday(saturday)).toBe('2026-08-23');

    // 2026-08-24 is Monday
    const monday = new Date(2026, 7, 24, 12, 0, 0);
    expect(getNextSunday(monday)).toBe('2026-08-30');
  });

  it('formatMeetingDateForDisplay formats strings or dates', () => {
    expect(formatMeetingDateForDisplay('2026-08-23')).toBe('2026-08-23');
  });

  it('formatDateTimeForDisplay is deterministic across server and browser locales', () => {
    expect(formatDateTimeForDisplay('2026-08-23T15:30:00.000Z')).toBe('Aug 23, 2026, 3:30 PM');
  });
});
