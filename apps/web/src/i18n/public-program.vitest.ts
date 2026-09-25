import { describe, expect, it } from 'vitest';

import { buildMeetingRenderHtml } from '../meetings/render';
import { getPublicProgramRenderLabels, resolvePublicLocale } from './public-program';

const meetingTypes = ['SACRAMENT', 'FAST_TESTIMONY', 'WARD_CONFERENCE', 'STAKE_CONFERENCE', 'GENERAL_CONFERENCE'];

describe('public program locale fallback', () => {
  it('uses the ward default when no valid public preference exists', () => {
    expect(resolvePublicLocale(undefined, 'es')).toBe('es');
    expect(resolvePublicLocale('unsupported', 'es')).toBe('es');
    expect(resolvePublicLocale('en-US', 'es')).toBe('en-US');
    expect(resolvePublicLocale(undefined, 'pt-BR')).toBe('en-US');
  });
});

for (const locale of ['en-US', 'es'] as const) {
  describe(`public program render labels: ${locale}`, () => {
    it('maps every canonical meeting type and falls back for unknown values', () => {
      const labels = meetingTypes.map((meetingType) => getPublicProgramRenderLabels(locale, meetingType));
      const unknown = getPublicProgramRenderLabels(locale, 'FUTURE_MEETING_TYPE');

      expect(labels).toHaveLength(5);
      expect(labels.every((value) => value.meetingTypeLabel)).toBe(true);
      expect(unknown.meetingTypeLabel).toBe(locale === 'es' ? 'Reunión' : 'Meeting');
      expect(Object.keys(labels[0].itemLabels)).toHaveLength(12);
    });

    it('provides complete renderer labels while preserving authored and official content', () => {
      const labels = getPublicProgramRenderLabels(locale, 'SACRAMENT');
      const html = buildMeetingRenderHtml({
        meetingDate: '2026-01-04',
        meetingType: 'SACRAMENT',
        labels,
        programItems: [
          {
            itemType: 'SPEAKER',
            title: 'Jane Doe',
            notes: 'Please welcome our speaker.',
            topic: 'Finding peace through prayer',
            hymnNumber: null,
            hymnTitle: null
          },
          { itemType: 'OPENING_HYMN', title: null, notes: null, hymnNumber: '2', hymnTitle: 'The Spirit of God' }
        ]
      });

      expect(labels.programTitle).toBe(locale === 'es' ? 'Programa de la reunión sacramental' : 'Sacrament Meeting Program');
      expect(labels.itemLabels.OPENING_HYMN).toBe(locale === 'es' ? 'Himno de apertura' : 'Opening hymn');
      expect(labels.sacramentPrayers).toBe(locale === 'es' ? 'Oraciones sacramentales' : 'Sacrament Prayers');
      expect(html).toContain('Jane Doe');
      expect(html).toContain('Please welcome our speaker.');
      expect(html).toContain('Finding peace through prayer');
      expect(html).toContain('The Spirit of God');
      expect(html).toContain('O God, the Eternal Father');
    });
  });
}
