import { BLOCK_WIDTHS } from './constants';
import { parseAdvancedLayout, type AdvancedDocumentLayout, type ColumnCount, type ColumnRatio } from './advanced-schema';

export type ValidationIssue = { code: string; path: string; message: string; severity: 'ERROR' | 'WARNING' };

const allowedRatios: Record<ColumnCount, readonly ColumnRatio[]> = {
  1: ['1/1'],
  2: ['1/1', '1/3+2/3', '2/3+1/3'],
  3: ['1/1']
};

export function validateAdvancedLayout(input: unknown): { layout: AdvancedDocumentLayout; issues: ValidationIssue[] } {
  try {
    const layout = parseAdvancedLayout(input);
    const issues: ValidationIssue[] = [];
    for (const [pageIndex, page] of layout.pages.entries()) for (const [regionIndex, region] of page.regions.entries()) {
      if (!allowedRatios[region.columns.count].includes(region.columns.ratio)) issues.push({ code: 'UNSUPPORTED_RATIO', path: `pages.${pageIndex}.regions.${regionIndex}.columns.ratio`, message: 'This column ratio is not supported for the selected column count', severity: 'ERROR' });
      if (region.columns.gutter !== region.gutter) issues.push({ code: 'GUTTER_MISMATCH', path: `pages.${pageIndex}.regions.${regionIndex}`, message: 'Region and column gutters must match', severity: 'ERROR' });
      for (const block of region.blocks) if (!BLOCK_WIDTHS.includes(block.width)) issues.push({ code: 'UNSUPPORTED_WIDTH', path: `blocks.${block.id}.width`, message: 'Block width is not supported', severity: 'ERROR' });
    }
    if (layout.pages.some((page) => page.regions.some((region) => region.blocks.length > 30))) issues.push({ code: 'DENSE_REGION', path: 'pages', message: 'This region may overflow in print preview', severity: 'WARNING' });
    return { layout, issues };
  } catch (error) {
    return { layout: undefined as never, issues: [{ code: 'INVALID_LAYOUT', path: '', message: error instanceof Error ? error.message : 'Invalid advanced layout', severity: 'ERROR' }] };
  }
}

export function snapWidth(value: number): (typeof BLOCK_WIDTHS)[number] {
  if (value >= 0.83) return 'FULL';
  if (value >= 0.62) return 'TWO_THIRDS';
  if (value >= 0.4) return 'HALF';
  return 'ONE_THIRD';
}

export function snapColumn(value: number, count: ColumnCount): number {
  return Math.max(0, Math.min(count - 1, Math.round(value * count)));
}
