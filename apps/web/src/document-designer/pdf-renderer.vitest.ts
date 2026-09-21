import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCUMENT_LAYOUT } from './schema';
import { renderDocumentPdf } from './pdf-renderer';
import type { ResolvedDocumentData } from './render-types';

const data: ResolvedDocumentData = { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward', values: { DOCUMENT_TITLE: 'Sacrament Meeting' }, meetingItems: [], warnings: [], media: {} };

describe('PDF renderer', () => {
  it('renders deterministic same-input output metadata and one page', async () => {
    const options = { metadata: { schemaVersion: 1, layoutHash: 'fnv1a-test', documentType: 'SACRAMENT_PROGRAM' as const, paper: 'LETTER' as const, orientation: 'PORTRAIT' as const, fold: 'NONE' as const, pageCount: 1, rendererVersion: 'm7.1', mediaAssetIds: [] }, title: 'Test Program' };
    const first = await renderDocumentPdf(DEFAULT_DOCUMENT_LAYOUT, data, options);
    const second = await renderDocumentPdf(DEFAULT_DOCUMENT_LAYOUT, data, options);
    expect(first.getNumberOfPages()).toBe(1);
    expect(second.getNumberOfPages()).toBe(1);
    expect(first.output('arraybuffer').byteLength).toBeGreaterThan(100);
  });
});
