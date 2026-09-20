import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { resolveDocumentData } from './data-resolver';
import { renderDocumentHtml } from './renderer';

describe('generic document renderer', () => {
  it('produces deterministic digital and print output with logical order and escaping', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const { data } = resolveDocumentData(layout, {
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      wardName: '<Ward>',
      programItems: [{ order: 1, label: 'Opening hymn', details: 'Hymn 2' }]
    });
    const options = { public: true, explicitPublicBlockTypes: ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'] } as const;
    const first = renderDocumentHtml({ layout, data, ...options });
    const second = renderDocumentHtml({ layout, data, ...options });
    const print = renderDocumentHtml({ layout, data, target: 'PRINT', ...options });
    expect(first.html).toBe(second.html);
    expect(first.html).toContain('&lt;Ward&gt;');
    expect(first.html).toContain('Opening hymn');
    expect(print.metadata.target).toBe('PRINT');
  });
});
