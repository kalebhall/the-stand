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

  it('returns false when meeting date is before start date', () => {
    expect(
      isAnnouncementActiveForDate(
        {
          isPermanent: false,
          startDate: '2026-05-01',
          endDate: null
        },
        '2026-04-30'
      )
    ).toBe(false);
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
