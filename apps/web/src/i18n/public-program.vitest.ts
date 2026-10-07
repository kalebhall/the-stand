import { describe, expect, it } from 'vitest';

import { buildMeetingRenderHtml } from '../meetings/render';
import { getPublicProgramRenderLabels, getStandRenderLabels, resolvePublicLocale } from './public-program';

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
      expect(Object.keys(labels[0].itemLabels)).toHaveLength(24);
      expect(labels[0].itemLabels.WELCOME).toBe(locale === 'es' ? 'Bienvenida' : 'Welcome');
      expect(labels[0].itemLabels.PRESIDING).toBe(locale === 'es' ? 'Preside' : 'Presiding');
      expect(labels[0].itemLabels.CONDUCTING).toBe(locale === 'es' ? 'Dirige' : 'Conducting');
      expect(labels[0].itemLabels.OPENING_PRAYER).toBe(locale === 'es' ? 'Oración de apertura' : 'Opening prayer');
      expect(labels[0].itemLabels.CLOSING_PRAYER).toBe(locale === 'es' ? 'Oración de clausura' : 'Closing prayer');
      expect(labels[0].itemLabels.HYMN).toBe(locale === 'es' ? 'Himno' : 'Hymn');
      expect(labels[0].itemLabels.SPECIAL_HYMN).toBe(locale === 'es' ? 'Himno especial' : 'Special hymn');
      expect(labels[0].itemLabels.SPECIAL_MUSICAL_NUMBER).toBe(locale === 'es' ? 'Número musical especial' : 'Special musical number');
      expect(labels[0].itemLabels.SUSTAINING).toBe(locale === 'es' ? 'Sostenimiento' : 'Sustaining');
      expect(labels[0].itemLabels.RELEASE).toBe(locale === 'es' ? 'Relevo' : 'Release');
    });

    it('uses the Stand catalog for localized operational labels', () => {
      const labels = getStandRenderLabels(locale);
      expect(labels.introduction).toBe(locale === 'es' ? 'Introducción' : 'Introduction');
      expect(labels.itemLabels?.SPECIAL_MUSICAL_NUMBER).toBe(locale === 'es' ? 'Número musical especial' : 'Special musical number');
      expect(Object.keys(labels.itemLabels)).toHaveLength(24);
      expect(labels.itemLabels.REST_HYMN).not.toBe('REST HYMN');
      expect(labels.itemLabels.TESTIMONIES).not.toBe('TESTIMONIES');
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
            notes: null,
            topic: 'Finding peace through prayer',
            programNotes: 'Please welcome our speaker.',
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

describe('Stand label completeness', () => {
  it.each(['en-US', 'es', 'tl', 'to'] as const)('localizes every supported program item in %s', (locale) => {
    const labels = getStandRenderLabels(locale);
    expect(Object.keys(labels.itemLabels)).toHaveLength(24);
    expect(Object.values(labels.itemLabels).every((label) => label.trim().length > 0)).toBe(true);
    expect(labels.itemLabels.REST_HYMN).not.toBe('REST HYMN');
    expect(labels.itemLabels.TESTIMONIES).not.toBe('TESTIMONIES');
  });
});
