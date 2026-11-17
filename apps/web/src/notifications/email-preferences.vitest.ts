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

  it('defers program-update digests until the next morning even when an update arrives before 8 AM', () => {
    const result = getNextDigestDeliveryTime({
      frequency: 'DAILY',
      timeZone: 'America/Los_Angeles',
      from: new Date('2026-08-28T14:00:00.000Z'),
      deferUntilNextDay: true
    });

    expect(result.toISOString()).toBe('2026-08-29T15:00:00.000Z');
  });

  it('sends Sunday program-update digests to Monday at 8 AM in the user timezone', () => {
    const beforeDigest = getNextDigestDeliveryTime({
      frequency: 'DAILY',
      timeZone: 'America/Los_Angeles',
      from: new Date('2026-08-30T14:00:00.000Z'),
      deferUntilNextDay: true
    });
    const afterDigest = getNextDigestDeliveryTime({
      frequency: 'DAILY',
      timeZone: 'America/Los_Angeles',
      from: new Date('2026-08-30T17:00:00.000Z'),
      deferUntilNextDay: true
    });

    expect(beforeDigest.toISOString()).toBe('2026-08-31T15:00:00.000Z');
    expect(afterDigest.toISOString()).toBe('2026-08-31T15:00:00.000Z');
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
