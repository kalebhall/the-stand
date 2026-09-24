import { describe, expect, it } from 'vitest';

import { DASHBOARD_CARD_IDS, normalizeDashboardCardOrder } from './catalog';

describe('dashboard card catalog', () => {
  it('keeps the canonical order when no preference exists', () => {
    expect(normalizeDashboardCardOrder([])).toEqual([...DASHBOARD_CARD_IDS]);
  });

  it('normalizes a partial preference against visible cards', () => {
    expect(normalizeDashboardCardOrder(['last-import', 'next-meeting'], ['next-meeting', 'last-import', 'draft-count'])).toEqual([
      'last-import',
      'next-meeting',
      'draft-count'
    ]);
  });

  it('rejects duplicate card IDs', () => {
    expect(normalizeDashboardCardOrder(['next-meeting', 'next-meeting'])).toBeNull();
  });
});
