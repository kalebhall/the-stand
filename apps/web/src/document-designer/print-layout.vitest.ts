import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCUMENT_LAYOUT } from './schema';
import { getFoldGuidance, getPhysicalPage, getFoldPanels } from './print-layout';
import { validatePrintLayout } from './overflow';
import type { ResolvedDocumentData } from './render-types';

const data: ResolvedDocumentData = { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward', values: { DOCUMENT_TITLE: 'Sacrament Meeting' }, meetingItems: [], warnings: [], media: {} };

describe('print layout', () => {
  it('calculates letter portrait physical dimensions and fold panels', () => {
    const page = getPhysicalPage('LETTER', 'PORTRAIT');
    expect(page.widthMm).toBe(215.9);
    expect(page.heightMm).toBe(279.4);
    expect(getFoldPanels({ paper: 'LETTER', orientation: 'PORTRAIT', fold: 'BIFOLD' })).toHaveLength(2);
  });

  it('provides fold guidance', () => {
    expect(getFoldGuidance('TRIFOLD')[0]).toContain('three panels');
    expect(getFoldGuidance('NONE')).toEqual([]);
  });
});

describe('print overflow', () => {
  it('validates a normal document', () => {
    const result = validatePrintLayout(DEFAULT_DOCUMENT_LAYOUT, data);
    expect(result.valid).toBe(true);
    expect(result.metadata.layoutHash).toMatch(/^fnv1a-/);
  });

  it('reports two physical pages for folded output', () => {
    const result = validatePrintLayout({ ...DEFAULT_DOCUMENT_LAYOUT, fold: 'BIFOLD' }, data);
    expect(result.pageCount).toBe(2);
  });

  it('blocks fixed-fold documents that cannot fit', () => {
    const layout = structuredClone(DEFAULT_DOCUMENT_LAYOUT);
    layout.fold = 'BIFOLD';
    const result = validatePrintLayout(layout, { ...data, values: { DOCUMENT_TITLE: 'x '.repeat(12000) } });
    expect(result.errors[0]?.code).toBe('FIXED_FOLD_OVERFLOW');
  });
});
