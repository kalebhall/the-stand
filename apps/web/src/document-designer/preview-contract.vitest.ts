import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { renderProgramPreview } from './preview-contract';

describe('program preview contract', () => {
  it('uses the same deterministic renderer for digital and print targets', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const source = { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward', programItems: [{ order: 1, label: 'Opening hymn' }] };
    const digital = renderProgramPreview(layout, source);
    const print = renderProgramPreview(layout, source, { target: 'PRINT' });
    expect(digital.html).toContain('data-target="DIGITAL"');
    expect(print.html).toContain('data-target="PRINT"');
    expect(digital.metadata.blockCount).toBe(print.metadata.blockCount);
  });

  it('validates public preview through the public-safety boundary', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    expect(() => renderProgramPreview(layout, { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', programItems: [] }, { publicVisitor: true })).not.toThrow();
  });
});
