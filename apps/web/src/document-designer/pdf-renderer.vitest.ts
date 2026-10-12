import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCUMENT_LAYOUT } from './schema';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { renderDocumentPdf } from './pdf-renderer';
import { normalizeToAdvanced, parseAdvancedLayout, projectAdvancedLayoutForOutput, type AdvancedBlock } from './advanced-schema';
import type { ResolvedDocumentData } from './render-types';
import type { DocumentLayout } from './types';
import { getPublicProgramRenderLabels } from '@/src/i18n/public-program';

const data: ResolvedDocumentData = {
  meetingDate: '2026-09-20',
  meetingType: 'SACRAMENT',
  wardName: 'Freedom Park Ward',
  values: { DOCUMENT_TITLE: 'Sacrament Meeting' },
  meetingItems: [],
  warnings: [],
  media: {}
};

describe('PDF renderer', () => {
  it('renders deterministic same-input output metadata and one page', async () => {
    const options = {
      metadata: {
        schemaVersion: 1,
        layoutHash: 'fnv1a-test',
        documentType: 'SACRAMENT_PROGRAM' as const,
        paper: 'LETTER' as const,
        orientation: 'PORTRAIT' as const,
        fold: 'NONE' as const,
        pageCount: 1,
        rendererVersion: 'm7.1',
        mediaAssetIds: []
      },
      title: 'Test Program'
    };
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
      pages: [
        {
          ...DEFAULT_DOCUMENT_LAYOUT.pages[0],
          regions: [
            {
              ...DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0],
              blocks: [
                {
                  ...DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0].blocks[0],
                  type: 'QR_CODE',
                  config: { href: 'https://example.test/program', label: 'Digital Program' }
                }
              ]
            }
          ]
        }
      ]
    };
    const pdf = await renderDocumentPdf(
      layout,
      { ...data, publicUrl: 'https://example.test/other' },
      {
        metadata: {
          schemaVersion: 1,
          layoutHash: 'fnv1a-qr',
          documentType: 'SACRAMENT_PROGRAM',
          paper: 'LETTER',
          orientation: 'PORTRAIT',
          fold: 'NONE',
          pageCount: 1,
          rendererVersion: 'm8.1',
          mediaAssetIds: []
        }
      }
    );
    const pdfBytes = pdf.output('arraybuffer');
    expect(new TextDecoder().decode(pdfBytes)).toContain('/Subtype /Image');
  });
  it('renders advanced bifold regions across two duplex pages', async () => {
    const layout = parseAdvancedLayout({ ...DEFAULT_DOCUMENT_LAYOUT, fold: 'BIFOLD' });
    const pdf = await renderDocumentPdf(layout, data, {
      metadata: {
        schemaVersion: 2,
        layoutHash: 'fnv1a-bifold',
        documentType: 'SACRAMENT_PROGRAM',
        paper: 'LETTER',
        orientation: 'PORTRAIT',
        fold: 'BIFOLD',
        pageCount: 2,
        rendererVersion: 'm7.1',
        mediaAssetIds: []
      }
    });
    expect(pdf.getNumberOfPages()).toBe(2);
  });

  it.each([
    ['TRIFOLD', 6],
    ['HALF_SHEET', 4]
  ] as const)('renders advanced %s panel content without dropping blocks', async (fold, expectedRegions) => {
    const source = adaptLegacyLayoutToDocument({
      preset: fold === 'TRIFOLD' ? 'TRI_FOLD_BULLETIN' : 'FULL_PAGE',
      announcementMode: 'AFTER_PROGRAM',
      coverMode: 'NONE'
    });
    const layout = parseAdvancedLayout({ ...source, fold, schemaVersion: 2 });
    expect(layout.pages[0].regions).toHaveLength(expectedRegions);
    const pdf = await renderDocumentPdf(layout, data, {
      metadata: {
        schemaVersion: 2,
        layoutHash: `fnv1a-${fold}`,
        documentType: 'SACRAMENT_PROGRAM',
        paper: 'LETTER',
        orientation: layout.orientation,
        fold,
        pageCount: 2,
        rendererVersion: 'm8.1',
        mediaAssetIds: []
      }
    });
    expect(pdf.getNumberOfPages()).toBe(2);
  });

  it('uses localized leadership labels in PDF output', async () => {
    const layout = normalizeToAdvanced(adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'NONE', coverMode: 'NONE' }));
    const pdfData = {
      ...data,
      renderLabels: getPublicProgramRenderLabels('es', 'SACRAMENT'),
      meetingItems: [
        { label: 'Himno de apertura', details: '#1 — The Morning Breaks', order: 1 },
        { label: 'Orador', details: 'Alex Hall\nFaith', order: 2 }
      ],
      values: { ...data.values, PRESIDING_CONDUCTING: JSON.stringify({ presiding: 'Bishop Hall', conducting: 'Sister Hall' }) }
    };
    const pdf = await renderDocumentPdf(projectAdvancedLayoutForOutput(layout, 'PRINT', pdfData), pdfData, {
      metadata: {
        schemaVersion: 1,
        layoutHash: 'localized-pdf',
        documentType: 'SACRAMENT_PROGRAM',
        paper: 'LETTER',
        orientation: 'PORTRAIT',
        fold: 'NONE',
        pageCount: 1,
        rendererVersion: 'm8.1',
        mediaAssetIds: []
      }
    });
    const pdfText = new TextDecoder().decode(pdf.output('arraybuffer'));
    expect(pdfText).toContain('(Preside: Bishop Hall) Tj');
    expect(pdfText).toContain('(Dirige: Sister Hall) Tj');
    expect(pdfText).toContain('(Himno de apertura: #1 - The Morning Breaks) Tj');
    expect(pdfText).toContain('(Orador: Alex Hall) Tj\nT* (Faith) Tj');
    expect(pdfText).not.toContain('—');
    expect(pdfText.split('(Preside: Bishop Hall) Tj')).toHaveLength(2);
    expect(pdfText.split('(Dirige: Sister Hall) Tj')).toHaveLength(2);
  });

  it('renders advanced leadership exactly once in PDF when standalone block visibility changes', async () => {
    const leadershipData = {
      ...data,
      renderLabels: getPublicProgramRenderLabels('en-US', 'SACRAMENT'),
      values: { ...data.values, PRESIDING_CONDUCTING: JSON.stringify({ presiding: 'Bishop Hall', conducting: 'Sister Hall' }) }
    };
    const variants: Array<{ name: string; configure: (block: AdvancedBlock) => void }> = [
      { name: 'hidden', configure: (block) => (block.visibility = 'HIDDEN') },
      { name: 'print-only', configure: (block) => (block.printBehavior = 'PRINT_ONLY') },
      { name: 'digital-only', configure: (block) => (block.printBehavior = 'DIGITAL_ONLY') },
      { name: 'public-only', configure: (block) => (block.visibilityRule = 'WHEN_PUBLIC') },
      { name: 'when-data-exists', configure: (block) => (block.visibilityRule = 'WHEN_DATA_EXISTS') }
    ];

    for (const variant of variants) {
      const layout = normalizeToAdvanced(adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'NONE', coverMode: 'NONE' }));
      const leadership = layout.pages
        .flatMap((page) => page.regions.flatMap((region) => region.blocks))
        .find((block) => block.type === 'PRESIDING_CONDUCTING');
      expect(leadership, variant.name).toBeDefined();
      variant.configure(leadership!);
      const pdf = await renderDocumentPdf(projectAdvancedLayoutForOutput(layout, 'PRINT', leadershipData), leadershipData, {
        metadata: {
          schemaVersion: 2,
          layoutHash: `leadership-${variant.name}`,
          documentType: 'SACRAMENT_PROGRAM',
          paper: 'LETTER',
          orientation: 'PORTRAIT',
          fold: 'NONE',
          pageCount: 1,
          rendererVersion: 'm8.1',
          mediaAssetIds: []
        }
      });
      const pdfText = new TextDecoder().decode(pdf.output('arraybuffer'));
      expect(pdfText.split('(Presiding: Bishop Hall) Tj')).toHaveLength(2);
      expect(pdfText.split('(Conducting: Sister Hall) Tj')).toHaveLength(2);
      expect(pdfText, variant.name).toContain('(Presiding: Bishop Hall) Tj');
    }
  });
});
