import { describe, expect, it } from 'vitest';

import { buildStandRows } from './render';

describe('buildStandRows', () => {
  it('uses default welcome text and bold placeholders for sustain phrasing', () => {
    const rows = buildStandRows([
      {
        itemType: 'SUSTAINING',
        title: 'Jane Smith',
        notes: 'Relief Society President',
        hymnNumber: null,
        hymnTitle: null
      }
    ]);

    expect(rows[0]).toEqual({
      kind: 'welcome',
      text: 'Welcome to The Church of Jesus Christ of Latter-day Saints.'
    });

    expect(rows[1]).toMatchObject({
      kind: 'sustain',
      summary: 'Jane Smith — Relief Society President'
    });

    if (rows[1].kind === 'sustain') {
      expect(rows[1].segments.some((segment) => segment.bold && segment.text === 'Jane Smith')).toBe(true);
      expect(rows[1].segments.some((segment) => segment.bold && segment.text === 'Relief Society President')).toBe(true);
    }
  });

  it('supports template overrides and standard label rendering', () => {
    const rows = buildStandRows(
      [
        {
          itemType: 'OPENING_HYMN',
          title: '',
          notes: '',
          hymnNumber: '1',
          hymnTitle: 'The Morning Breaks'
        },
        {
          itemType: 'RELEASE',
          title: 'John Doe',
          notes: 'Elders Quorum President',
          hymnNumber: null,
          hymnTitle: null
        }
      ],
      {
        welcomeText: 'Welcome friends.',
        releaseTemplate: 'Release **{memberName}** from **{callingName}**.'
      }
    );

    expect(rows[0]).toEqual({ kind: 'welcome', text: 'Welcome friends.' });
    expect(rows[1]).toEqual({ kind: 'standard', label: 'Opening Hymn', details: '1 — The Morning Breaks' });

    expect(rows[2]).toMatchObject({ kind: 'release', summary: 'John Doe — Elders Quorum President' });
    if (rows[2].kind === 'release') {
      expect(rows[2].segments.filter((segment) => segment.bold).map((segment) => segment.text)).toEqual(['John Doe', 'Elders Quorum President']);
    }
  });
});
