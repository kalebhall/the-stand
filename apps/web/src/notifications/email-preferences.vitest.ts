import { describe, expect, it } from 'vitest';

import { getNextDigestDeliveryTime, isValidIanaTimeZone, normalizeNotificationTimeZone } from './email-preferences';

describe('notification email preferences', () => {
  it('returns the next daily delivery at 8 AM in the user timezone', () => {
    const result = getNextDigestDeliveryTime({
      frequency: 'DAILY',
      timeZone: 'America/Los_Angeles',
      from: new Date('2026-08-28T14:00:00.000Z')
    });

    expect(result.toISOString()).toBe('2026-08-28T15:00:00.000Z');
  });

  it('returns the next Monday delivery for weekly digests', () => {
    const result = getNextDigestDeliveryTime({
      frequency: 'WEEKLY',
      timeZone: 'America/Los_Angeles',
      from: new Date('2026-08-28T16:00:00.000Z')
    });

    expect(result.toISOString()).toBe('2026-08-31T15:00:00.000Z');
  });

  it('validates and normalizes IANA timezones', () => {
    expect(isValidIanaTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidIanaTimeZone('Not/A_Timezone')).toBe(false);
    expect(normalizeNotificationTimeZone(' America/Los_Angeles ')).toBe('America/Los_Angeles');
    expect(() => normalizeNotificationTimeZone('Not/A_Timezone')).toThrow('Invalid notification email timezone');
  });
});
