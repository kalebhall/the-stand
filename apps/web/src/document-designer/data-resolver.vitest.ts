import { describe, expect, it } from 'vitest';

import { resolveDocumentData } from './data-resolver';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';

describe('document data resolver', () => {
  it('returns only safe meeting-facing data and preserves item order', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const result = resolveDocumentData(layout, {
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      wardName: 'Freedom Park Ward',
      programItems: [
        { order: 2, label: 'Closing hymn' },
        { order: 1, label: 'Opening hymn' }
      ],
      publicUrl: 'https://example.test/p/token'
    });
    expect(result.data.meetingItems.map((item) => item.order)).toEqual([2, 1]);
    expect(result.data.values.WARD_NAME).toBe('Freedom Park Ward');
    expect(result.data.values).not.toHaveProperty('WARD_LEADERSHIP');
  });
  it('honors meeting info visibility properties', () => {
    const layout = structuredClone(adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' }));
    const meetingInfo = layout.pages[0].regions[0].blocks.find((block) => block.type === 'MEETING_INFO');
    if (!meetingInfo || meetingInfo.type !== 'MEETING_INFO') throw new Error('missing meeting info block');
    meetingInfo.config = { includeDate: false, includeTime: false, includeLocation: true };
    const result = resolveDocumentData(layout, {
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      location: 'Chapel',
      programItems: []
    });
    expect(result.data.values.MEETING_INFO).toBe('Chapel');
  });
});
