import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { resolveDocumentData } from './data-resolver';
import { renderDocumentHtml } from './renderer';
import { normalizeToAdvanced } from './advanced-schema';

describe('generic document renderer', () => {
  it('produces deterministic digital and print output with logical order and escaping', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const { data } = resolveDocumentData(layout, {
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      wardName: '<Ward>',
      programItems: [{ order: 1, label: 'Opening hymn', details: 'Hymn 2' }]
    });
    const options = {
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    } as const;
    const first = renderDocumentHtml({ layout, data, ...options });
    const second = renderDocumentHtml({ layout, data, ...options });
    const print = renderDocumentHtml({ layout, data, target: 'PRINT', ...options });
    expect(first.html).toBe(second.html);
    expect(first.html).toContain('&lt;Ward&gt;');
    expect(first.html).toContain('Opening hymn');
    expect(print.metadata.target).toBe('PRINT');
  });

  it('resolves reusable custom text per block in advanced HTML output', () => {
    const base = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const region = base.pages[0].regions[0];
    const first = {
      ...region.blocks[0],
      id: '11111111-1111-4111-8111-111111111111',
      type: 'CUSTOM_TEXT' as const,
      source: { key: 'MEETING_DATE' as const },
      config: { text: 'RAW_DATE' }
    };
    const second = {
      ...region.blocks[0],
      id: '22222222-2222-4222-8222-222222222222',
      type: 'CUSTOM_TEXT' as const,
      source: { key: 'WARD_NAME' as const },
      config: { text: 'RAW_WARD' }
    };
    const advanced = {
      ...base,
      pages: [
        {
          ...base.pages[0],
          regions: [{ ...region, blocks: [first, second], columns: { ...region.columns, blockIds: [[first.id, second.id]] } }]
        }
      ]
    };
    const { layout, data } = resolveDocumentData(
      advanced,
      {
        meetingDate: '2026-01-04',
        meetingType: 'SACRAMENT',
        wardName: 'Freedom Park Ward',
        programItems: []
      },
      { preserveAdvancedLayout: true }
    );
    const output = renderDocumentHtml({ layout, data });
    expect(output.html).toContain('2026-01-04');
    expect(output.html).toContain('Freedom Park Ward');
    expect(output.html).not.toContain('RAW_DATE');
    expect(output.html).not.toContain('RAW_WARD');
  });

  it('uses semantic face identity when folded regions are reordered', () => {
    const source = adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const advanced = normalizeToAdvanced(source);
    advanced.pages[0].regions = [...advanced.pages[0].regions].reverse();
    const { data } = resolveDocumentData(
      advanced,
      { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', wardName: 'Ward', programItems: [] },
      { preserveAdvancedLayout: true }
    );
    const output = renderDocumentHtml({ layout: advanced, data, target: 'PRINT' });
    const firstSide = output.html.split('data-side-index="0"')[1]?.split('data-side-index="1"')[0] ?? '';
    expect(firstSide.indexOf('data-region-face="BACK_COVER"')).toBeLessThan(firstSide.indexOf('data-region-face="FRONT_COVER"'));
  });

  it.each([
    ['BIFOLD', 2],
    ['TRIFOLD', 2],
    ['HALF_SHEET', 2]
  ] as const)('renders each %s side as a separate printable physical page', (fold, expectedPages) => {
    const preset = fold === 'TRIFOLD' ? 'TRI_FOLD_BULLETIN' : fold === 'BIFOLD' ? 'SINGLE_SHEET_BIFOLD' : 'FULL_PAGE';
    const source = adaptLegacyLayoutToDocument({ preset, announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const advanced = normalizeToAdvanced({ ...source, fold });
    const { data } = resolveDocumentData(
      advanced,
      { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', wardName: 'Ward', programItems: [] },
      { preserveAdvancedLayout: true }
    );
    const output = renderDocumentHtml({ layout: advanced, data, target: 'PRINT' });
    expect(output.html.match(/class="document-page"/g)?.length).toBe(expectedPages);
    expect(output.html).toContain('data-side-index="1"');
  });
});
