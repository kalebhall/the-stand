import { describe, expect, it } from 'vitest';

import { resolveDocumentData } from './data-resolver';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { PublicSafetyError, validatePublicDocumentLayout } from './public-safety';
import { renderDocumentHtml } from './renderer';

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
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE']
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
    expect(() => validatePublicDocumentLayout(layout, ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'])).not.toThrow();
  });

  it('renders deterministic logical digital and print HTML with escaped content', () => {
    const { layout, data } = resolveDocumentData(adaptLegacyLayoutToDocument(legacy), {
      ...source,
      wardName: '<Ward>'
    }, { public: true, explicitPublicBlockTypes: ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'] });
    const digital = renderDocumentHtml({ layout, data, public: true, explicitPublicBlockTypes: ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'] });
    const digitalAgain = renderDocumentHtml({ layout, data, public: true, explicitPublicBlockTypes: ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'] });
    const print = renderDocumentHtml({ layout, data, target: 'PRINT', public: true, explicitPublicBlockTypes: ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'] });
    expect(digital.html).toBe(digitalAgain.html);
    expect(digital.html).toContain('&lt;Ward&gt;');
    expect(digital.html).toContain('Opening hymn');
    expect(print.metadata.target).toBe('PRINT');
    expect(print.html).toContain('document-fold--none');
  });
});
