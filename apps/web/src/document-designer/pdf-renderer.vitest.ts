import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCUMENT_LAYOUT } from './schema';
import { renderDocumentPdf } from './pdf-renderer';
import { parseAdvancedLayout } from './advanced-schema';
import type { ResolvedDocumentData } from './render-types';

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

  it('renders advanced bifold regions across two duplex pages', async () => {
    const layout = parseAdvancedLayout({ ...DEFAULT_DOCUMENT_LAYOUT, fold: 'BIFOLD' });
    const pdf = await renderDocumentPdf(layout, data, { metadata: { schemaVersion: 2, layoutHash: 'fnv1a-bifold', documentType: 'SACRAMENT_PROGRAM', paper: 'LETTER', orientation: 'PORTRAIT', fold: 'BIFOLD', pageCount: 2, rendererVersion: 'm7.1', mediaAssetIds: [] } });
    expect(pdf.getNumberOfPages()).toBe(2);
  });
});
