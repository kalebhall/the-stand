import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCUMENT_LAYOUT } from './schema';
import { renderDocumentPdf } from './pdf-renderer';
import { parseAdvancedLayout } from './advanced-schema';
import type { ResolvedDocumentData } from './render-types';
import type { DocumentLayout } from './types';

const data: ResolvedDocumentData = { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward', values: { DOCUMENT_TITLE: 'Sacrament Meeting' }, meetingItems: [], warnings: [], media: {} };

describe('PDF renderer', () => {
  it('renders deterministic same-input output metadata and one page', async () => {
    const options = { metadata: { schemaVersion: 1, layoutHash: 'fnv1a-test', documentType: 'SACRAMENT_PROGRAM' as const, paper: 'LETTER' as const, orientation: 'PORTRAIT' as const, fold: 'NONE' as const, pageCount: 1, rendererVersion: 'm7.1', mediaAssetIds: [] }, title: 'Test Program' };
    const layout = { ...DEFAULT_DOCUMENT_LAYOUT, fold: 'NONE' as const };
    const first = await renderDocumentPdf(layout, data, options);
    const second = await renderDocumentPdf(layout, data, options);
    expect(first.getNumberOfPages()).toBe(1);
    expect(second.getNumberOfPages()).toBe(1);
    expect(first.output('arraybuffer').byteLength).toBeGreaterThan(100);
  });

  it('renders a configured QR block as a real PDF image', async () => {
    const layout: DocumentLayout = {
      ...DEFAULT_DOCUMENT_LAYOUT,
      fold: 'NONE',
      pages: [{
        ...DEFAULT_DOCUMENT_LAYOUT.pages[0],
        regions: [{
          ...DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0],
          blocks: [{
            ...DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0].blocks[0],
            type: 'QR_CODE',
            config: { href: 'https://example.test/program', label: 'Digital Program' }
          }]
        }]
      }]
    };
    const pdf = await renderDocumentPdf(layout, { ...data, publicUrl: 'https://example.test/other' }, { metadata: { schemaVersion: 1, layoutHash: 'fnv1a-qr', documentType: 'SACRAMENT_PROGRAM', paper: 'LETTER', orientation: 'PORTRAIT', fold: 'NONE', pageCount: 1, rendererVersion: 'm8.1', mediaAssetIds: [] } });
    const pdfBytes = pdf.output('arraybuffer');
    expect(new TextDecoder().decode(pdfBytes)).toContain('/Subtype /Image');
  });
  it('renders advanced bifold regions across two duplex pages', async () => {
    const layout = parseAdvancedLayout({ ...DEFAULT_DOCUMENT_LAYOUT, fold: 'BIFOLD' });
    const pdf = await renderDocumentPdf(layout, data, { metadata: { schemaVersion: 2, layoutHash: 'fnv1a-bifold', documentType: 'SACRAMENT_PROGRAM', paper: 'LETTER', orientation: 'PORTRAIT', fold: 'BIFOLD', pageCount: 2, rendererVersion: 'm7.1', mediaAssetIds: [] } });
    expect(pdf.getNumberOfPages()).toBe(2);
  });
});
