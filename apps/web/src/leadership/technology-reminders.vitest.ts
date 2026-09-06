import { describe, expect, it } from 'vitest';

import { getTechnologyReminderEndDate } from './technology-reminders';

describe('technology reminders', () => {
  it('calculates bounded upcoming meeting horizon', () => {
    expect(getTechnologyReminderEndDate(new Date('2026-09-05T12:00:00Z')).toISOString()).toBe('2026-09-12T12:00:00.000Z');
  });

  it('rejects unsafe horizon values', () => {
    expect(() => getTechnologyReminderEndDate(new Date(), 0)).toThrow();
    expect(() => getTechnologyReminderEndDate(new Date(), 32)).toThrow();
  });
});
