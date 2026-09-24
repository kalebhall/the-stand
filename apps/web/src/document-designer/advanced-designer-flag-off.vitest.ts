import { describe, expect, it } from 'vitest';

import { normalizeToAdvanced } from './advanced-schema';
import { BUILT_IN_TEMPLATES } from './built-in-templates';
import { resolveDocumentData } from './data-resolver';
import { renderDocumentHtml } from './renderer';
import { renderDocumentPdf } from './pdf-renderer';
import { renderProgramPreview } from './preview-contract';

const source = {
  meetingDate: '2026-10-04',
  meetingType: 'SACRAMENT',
  wardName: 'Freedom Park Ward',
  programItems: [
    { order: 0, label: 'Introduction', details: 'Bishop Hall' },
    { order: 1, label: 'Sister Hall', details: 'Faith in Jesus Christ' },
    { order: 2, label: 'Sacrament', details: null }
  ]
};

const advancedFixture = normalizeToAdvanced(BUILT_IN_TEMPLATES.find((template) => template.key === 'full-page-standard')!.layout);

describe('advanced-designer flag-off fallback', () => {
  it('keeps preview and print on the same basic Core layout without advanced projection', () => {
    const preview = renderProgramPreview(advancedFixture, source, { target: 'DIGITAL', advancedProjection: false });
    const resolved = resolveDocumentData(advancedFixture, source, { target: 'DIGITAL', advancedProjection: false });
    const basic = renderDocumentHtml({ layout: resolved.layout, data: resolved.data, target: 'DIGITAL' });
    const printResolved = resolveDocumentData(advancedFixture, source, { target: 'PRINT', advancedProjection: false });
    const print = renderDocumentHtml({ layout: printResolved.layout, data: printResolved.data, target: 'PRINT' });

    expect(preview.html).toBe(basic.html);
    expect(print.html).not.toContain('<div class="document-panels"');
    expect(print.html).toContain('Faith in Jesus Christ');
    expect(preview.html).not.toContain('data-fold="BIFOLD"');
  });

  it('renders a PDF from the same basic fallback fixture', async () => {
    const resolved = resolveDocumentData(advancedFixture, source, { target: 'PRINT', advancedProjection: false });
    const pdf = await renderDocumentPdf(resolved.layout, resolved.data, {
      metadata: {
        schemaVersion: resolved.layout.schemaVersion,
        layoutHash: 'flag-off-basic-fixture',
        documentType: resolved.layout.documentType,
        paper: resolved.layout.paper,
        orientation: resolved.layout.orientation,
        fold: resolved.layout.fold,
        pageCount: 1,
        rendererVersion: 'test',
        mediaAssetIds: []
      },
      title: 'Freedom Park Ward Program'
    });

    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(0);
    expect(pdf.output()).toContain('Faith in Jesus Christ');
  });
});
