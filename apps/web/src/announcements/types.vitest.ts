import { describe, expect, it } from 'vitest';

import { isAnnouncementActiveForDate } from './types';

describe('isAnnouncementActiveForDate', () => {
  it('returns true for permanent announcement outside date window', () => {
    expect(
      isAnnouncementActiveForDate(
        {
          isPermanent: true,
          startDate: '2026-05-01',
          endDate: '2026-05-02'
        },
        '2026-01-01'
      )
    ).toBe(true);
  });

  it('returns true for announcement without start or end date (does not expire)', () => {
    expect(
      isAnnouncementActiveForDate(
        {
          isPermanent: false,
          startDate: null,
          endDate: null
        },
        '2026-10-15'
      )
    ).toBe(true);
  });

  it('returns false when meeting date is before start date', () => {
    expect(
      isAnnouncementActiveForDate(
        {
          isPermanent: false,
          startDate: '2026-05-10',
          endDate: null
        },
        '2026-05-03'
      )
    ).toBe(false);
  });

  it('returns true when meeting date matches start date', () => {
    expect(
      isAnnouncementActiveForDate(
        {
          isPermanent: false,
          startDate: '2026-05-10',
          endDate: null
        },
        '2026-05-10'
      )
    ).toBe(true);
  });

  it('returns false when meeting date is after end date', () => {
    expect(
      isAnnouncementActiveForDate(
        {
          isPermanent: false,
          startDate: null,
          endDate: '2026-04-01'
        },
        '2026-04-02'
      )
    ).toBe(false);
  });
});
