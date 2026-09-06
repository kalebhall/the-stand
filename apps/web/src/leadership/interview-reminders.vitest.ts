import { describe, expect, it } from 'vitest';

import {
  getInterviewReminderWindow,
  isInterviewWithinReminderWindow
} from './interview-reminders';

describe('interview reminders', () => {
  const now = new Date('2026-09-05T12:00:00.000Z');

  it('creates bounded upcoming window', () => {
    const window = getInterviewReminderWindow(now);
    expect(window.startsAt.toISOString()).toBe('2026-09-05T12:00:00.000Z');
    expect(window.endsAt.toISOString()).toBe('2026-09-06T12:00:00.000Z');
  });

  it('includes scheduled interviews in window and excludes completed, cancelled, and outside records', () => {
    const window = getInterviewReminderWindow(now);
    expect(isInterviewWithinReminderWindow('2026-09-05T13:00:00Z', 'SCHEDULED', window)).toBe(true);
    expect(isInterviewWithinReminderWindow('2026-09-06T12:00:00Z', 'SCHEDULED', window)).toBe(true);
    expect(isInterviewWithinReminderWindow('2026-09-05T13:00:00Z', 'COMPLETED', window)).toBe(false);
    expect(isInterviewWithinReminderWindow('2026-09-05T11:59:00Z', 'SCHEDULED', window)).toBe(false);
    expect(isInterviewWithinReminderWindow('2026-09-06T12:01:00Z', 'SCHEDULED', window)).toBe(false);
  });

  it('rejects invalid horizons', () => {
    expect(() => getInterviewReminderWindow(now, 0)).toThrow();
    expect(() => getInterviewReminderWindow(now, 169)).toThrow();
  });
});
