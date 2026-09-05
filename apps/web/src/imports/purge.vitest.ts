import { describe, expect, it } from 'vitest';

import { normalizeRetentionDays, PURGED_RAW_TEXT, RAW_PASTE_PURGE_SQL } from './purge';

describe('raw paste retention', () => {
  it('accepts bounded whole-day retention values', () => {
    expect(normalizeRetentionDays(30)).toBe(30);
    expect(normalizeRetentionDays(3650)).toBe(3650);
  });

  it.each([0, -1, 1.5, 3651, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid retention value %s', (value) => {
    expect(() => normalizeRetentionDays(value)).toThrow('retentionDays must be an integer between 1 and 3650');
  });

  it('uses typed SQL parameters and replaces raw text with the purge marker', () => {
    expect(RAW_PASTE_PURGE_SQL).toContain('$1::int');
    expect(RAW_PASTE_PURGE_SQL).toContain('$2::text');
    expect(PURGED_RAW_TEXT).toBe('[purged]');
  });
});
