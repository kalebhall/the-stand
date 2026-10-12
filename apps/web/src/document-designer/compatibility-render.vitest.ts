import { describe, expect, it } from 'vitest';

import { normalizeToAdvanced, projectAdvancedLayoutForOutput, type AdvancedBlock } from './advanced-schema';
import { resolveDocumentData } from './data-resolver';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { buildPublicPreviewSource } from './meeting-document-service';
import { PublicSafetyError, validatePublicDocumentLayout } from './public-safety';
import { renderDocumentHtml } from './renderer';
import { getPublicProgramRenderLabels } from '@/src/i18n/public-program';

const legacy = { preset: 'FULL_PAGE' as const, announcementMode: 'AFTER_PROGRAM' as const, coverMode: 'NONE' as const };

const source = {
  meetingDate: '2026-01-04',
  meetingType: 'SACRAMENT',
  wardName: 'Freedom Park Ward',
  programItems: [{ order: 1, label: 'Opening hymn', details: 'Hymn 2' }],
  publicUrl: 'https://example.test/p/token'
};

describe('document designer compatibility renderer', () => {
  it('resolves safe meeting data without private source fields', () => {
    const { layout, data } = resolveDocumentData(adaptLegacyLayoutToDocument(legacy), source, {
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    });
    expect(layout.metadata).toMatchObject({ legacyPreset: 'FULL_PAGE' });
    expect(data.values.WARD_NAME).toBe('Freedom Park Ward');
    expect(data.values.MEETING_PROGRAM).toContain('Opening hymn');
    expect(data.values).not.toHaveProperty('WARD_LEADERSHIP');
  });

  it('rejects internal blocks from public output', () => {
    const layout = adaptLegacyLayoutToDocument(legacy);
    const internal = { ...layout.pages[0].regions[0].blocks[0], type: 'WARD_LEADERSHIP', config: { text: 'Private' } } as never;
    const unsafe = { ...layout, pages: [{ ...layout.pages[0], regions: [{ ...layout.pages[0].regions[0], blocks: [internal] }] }] };
    expect(() => validatePublicDocumentLayout(unsafe)).toThrow(PublicSafetyError);
  });

  it('requires explicit approval for public-with-fields blocks', () => {
    const layout = adaptLegacyLayoutToDocument(legacy);
    expect(() => validatePublicDocumentLayout(layout)).toThrow(/explicit public approval/);
    expect(() =>
      validatePublicDocumentLayout(layout, ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE'])
    ).not.toThrow();
  });

  it('renders deterministic logical digital and print HTML with escaped content', () => {
    const { layout, data } = resolveDocumentData(
      adaptLegacyLayoutToDocument(legacy),
      {
        ...source,
        wardName: '<Ward>'
      },
      { public: true, explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE'] }
    );
    const digital = renderDocumentHtml({
      layout,
      data,
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    });
    const digitalAgain = renderDocumentHtml({
      layout,
      data,
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    });
    const print = renderDocumentHtml({
      layout,
      data,
      target: 'PRINT',
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    });
    expect(digital.html).toBe(digitalAgain.html);
    expect(digital.html).toContain('&lt;Ward&gt;');
    expect(digital.html).toContain('Opening hymn');
    expect(print.metadata.target).toBe('PRINT');
    expect(print.html).toContain('document-fold--none');
  });

  it('renders published program item types as labels and entered values as values', () => {
    const publicSource = buildPublicPreviewSource({ meetingDate: '2026-01-04', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward' }, [
      { itemType: 'SPEAKER', title: 'Alex Hall', topic: 'Faith', sequence: 2, hymnTitle: null },
      { itemType: 'OPENING_HYMN', title: null, sequence: 3, hymnNumber: '123', hymnTitle: 'I Need Thee Every Hour' },
      {
        itemType: 'INTRODUCTION',
        title: 'Introduction',
        sequence: 1,
        hymnTitle: null,
        introductionRoles: { presiding: 'Bishop Hall', conducting: 'Sister Hall' }
      }
    ]);
    const { layout, data } = resolveDocumentData(adaptLegacyLayoutToDocument(legacy), publicSource, {
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    });
    const rendered = renderDocumentHtml({
      layout,
      data,
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    });

    expect(rendered.html).toContain('.document-key-value dd { margin:0; white-space:pre-line; }');
    expect(rendered.html).toContain(
      `<dt>${publicSource.renderLabels.itemLabels.SPEAKER}</dt><dd>${['Alex Hall', 'Faith'].join(String.fromCharCode(10))}</dd>`
    );
    expect(rendered.html).toContain(`<dt>${publicSource.renderLabels.itemLabels.OPENING_HYMN}</dt><dd>#123 — I Need Thee Every Hour</dd>`);
    expect(rendered.html).not.toContain('<dt>Introduction</dt>');
    expect(rendered.html.split('<dt>Presiding</dt>')).toHaveLength(2);
    expect(rendered.html.split('<dt>Conducting</dt>')).toHaveLength(2);
    expect(rendered.html).toContain('<dt>Presiding</dt><dd>Bishop Hall</dd>');
  });

  it('renders advanced leadership exactly once across target and visibility projections', () => {
    const publicSource = buildPublicPreviewSource({ meetingDate: '2026-01-04', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward' }, [
      {
        itemType: 'INTRODUCTION',
        title: 'Introduction',
        sequence: 1,
        hymnTitle: null,
        introductionRoles: { presiding: 'Bishop Hall', conducting: 'Sister Hall' }
      }
    ]);
    const data = resolveDocumentData(adaptLegacyLayoutToDocument(legacy), publicSource, {
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    }).data;
    const variants: Array<{ name: string; configure: (block: AdvancedBlock) => void }> = [
      { name: 'hidden', configure: (block) => (block.visibility = 'HIDDEN') },
      { name: 'print-only', configure: (block) => (block.printBehavior = 'PRINT_ONLY') },
      { name: 'digital-only', configure: (block) => (block.printBehavior = 'DIGITAL_ONLY') },
      { name: 'public-only', configure: (block) => (block.visibilityRule = 'WHEN_PUBLIC') },
      { name: 'when-data-exists', configure: (block) => (block.visibilityRule = 'WHEN_DATA_EXISTS') }
    ];
    const publicBlockTypes = ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE'];

    for (const variant of variants) {
      const advanced = normalizeToAdvanced(adaptLegacyLayoutToDocument(legacy));
      const leadership = advanced.pages
        .flatMap((page) => page.regions.flatMap((region) => region.blocks))
        .find((block) => block.type === 'PRESIDING_CONDUCTING');
      expect(leadership, variant.name).toBeDefined();
      variant.configure(leadership!);

      for (const target of ['DIGITAL', 'PRINT'] as const) {
        const layout = projectAdvancedLayoutForOutput(advanced, target, data);
        const rendered = renderDocumentHtml({ layout, data, target, explicitPublicBlockTypes: publicBlockTypes });
        expect(rendered.html.split('<dt>Presiding</dt>'), `${variant.name} ${target}`).toHaveLength(2);
        expect(rendered.html.split('<dt>Conducting</dt>'), `${variant.name} ${target}`).toHaveLength(2);
        expect(rendered.html).toContain('<dt>Presiding</dt><dd>Bishop Hall</dd>');
      }
    }
  });

  it('uses localized labels in document digital and print output', () => {
    const { layout, data } = resolveDocumentData(
      adaptLegacyLayoutToDocument(legacy),
      {
        ...source,
        publicValues: { PRESIDING_CONDUCTING: JSON.stringify({ presiding: 'Bishop Hall', conducting: 'Sister Hall' }) },
        renderLabels: getPublicProgramRenderLabels('es', 'SACRAMENT')
      },
      { public: true, explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE'] }
    );
    const digital = renderDocumentHtml({
      layout,
      data,
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    });
    const print = renderDocumentHtml({
      layout,
      data,
      target: 'PRINT',
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    });

    expect(digital.html).toContain('Programa de la reunión sacramental');
    expect(digital.html).toContain('Preside');
    expect(digital.html).toContain('Dirige');
    expect(digital.html).toContain('aria-label="Programa de la reunión sacramental"');
    expect(print.html).toContain('Programa de la reunión sacramental');
  });
});
