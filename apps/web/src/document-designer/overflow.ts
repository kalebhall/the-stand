import { parseDocumentLayout } from './schema';
import { allBlocks } from './public-safety';
import { getExpectedPageCount, getFoldGuidance, getPhysicalPage } from './print-layout';
import { PDF_RENDERER_VERSION, type PrintIssue, type PrintRenderMetadata, type PrintValidationResult } from './print-types';
import type { DocumentLayout } from './types';
import type { ResolvedDocumentData } from './render-types';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function hashLayout(layout: unknown): string {
  let hash = 2166136261;
  for (const char of stableStringify(layout)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function metadata(layout: DocumentLayout, data: ResolvedDocumentData, pageCount: number): PrintRenderMetadata {
  const mediaAssetIds = allBlocks(layout).filter((block) => block.type === 'IMAGE').map((block) => (block.config as { assetId: string | null }).assetId).filter((id): id is string => Boolean(id)).sort();
  return { schemaVersion: layout.schemaVersion, layoutHash: hashLayout(layout), documentType: layout.documentType, paper: layout.paper, orientation: layout.orientation, fold: layout.fold, pageCount, rendererVersion: PDF_RENDERER_VERSION, mediaAssetIds };
}

function textLength(block: { type: string; config: unknown }, data: ResolvedDocumentData): number {
  if (block.type === 'MEETING_PROGRAM') return data.meetingItems.reduce((total, item) => total + item.label.length + (item.details?.length ?? 0), 0);
  const resolved = data.values[block.type as keyof typeof data.values];
  if (typeof resolved === 'string') return resolved.length;
  const config = block.config as { text?: string };
  return config.text?.length ?? 0;
}

export function validatePrintLayout(inputLayout: unknown, data: ResolvedDocumentData): PrintValidationResult {
  const errors: PrintIssue[] = [];
  const warnings: PrintIssue[] = [];
  let layout: DocumentLayout;
  try { layout = parseDocumentLayout(inputLayout); } catch (error) {
    const issue = { code: 'INVALID_LAYOUT', message: error instanceof Error ? error.message : 'Invalid document layout', severity: 'ERROR' as const };
    return { valid: false, errors: [issue], warnings: [], pageCount: 0, foldGuidance: [], metadata: { schemaVersion: 0, layoutHash: 'invalid', documentType: 'SACRAMENT_PROGRAM', paper: 'LETTER', orientation: 'PORTRAIT', fold: 'NONE', pageCount: 0, rendererVersion: PDF_RENDERER_VERSION, mediaAssetIds: [] } };
  }
  const physical = getPhysicalPage(layout.paper, layout.orientation);
  const blocks = allBlocks(layout).filter((block) => block.visibility !== 'HIDDEN' && block.printBehavior !== 'DIGITAL_ONLY');
  const panelCount = layout.fold === 'TRIFOLD' ? 3 : layout.fold === 'BIFOLD' || layout.fold === 'HALF_SHEET' ? 2 : 1;
  const panelWidth = layout.fold === 'NONE' ? physical.contentWidthMm : physical.contentWidthMm / panelCount;
  const charsPerLine = Math.max(12, Math.floor((panelWidth - (layout.fold === 'NONE' ? 0 : 6)) / Math.max(1.8, layout.theme.baseFontSize * 0.55)));
  const estimatedLines = blocks.reduce((total, block) => {
    if (block.type === 'IMAGE') return total + 10;
    if (block.type === 'SPACER') return total + Math.max(1, Math.ceil(Number((block.config as { height?: number }).height ?? 12) / 3.5));
    const heading = block.type === 'DOCUMENT_TITLE' || block.type === 'WARD_NAME' || block.type === 'MEETING_INFO';
    const contentLines = Math.max(1, Math.ceil(textLength(block, data) / charsPerLine));
    return total + contentLines * (heading ? 1.35 : 1);
  }, 0);
  const usableLines = Math.max(1, Math.floor(physical.contentHeightMm / Math.max(3.5, layout.theme.baseFontSize * 0.42)));
  const flowingPages = Math.max(1, Math.ceil(estimatedLines / usableLines));
  const pageCount = getExpectedPageCount(layout, flowingPages);
  if (layout.fold !== 'NONE' && flowingPages > 1) errors.push({ code: 'FIXED_FOLD_OVERFLOW', message: 'This folded format cannot add another sheet.', severity: 'ERROR', suggestion: 'Remove content, shorten text, reduce spacing, or choose Full Page.' });
  if (layout.fold === 'NONE' && flowingPages > 1) warnings.push({ code: 'FLOWING_PAGE_COUNT', message: `Content flows to ${flowingPages} pages.`, severity: 'WARNING', suggestion: 'Review page breaks before downloading.' });
  if (layout.theme.baseFontSize < 9) errors.push({ code: 'MIN_FONT_SIZE', message: 'Font size is below the print minimum of 9px.', severity: 'ERROR', suggestion: 'Increase the base font size.' });
  for (const block of blocks) {
    if (block.type === 'IMAGE') {
      const assetId = (block.config as { assetId: string | null }).assetId;
      if (!assetId || !data.media?.[assetId]) errors.push({ code: 'IMAGE_UNAVAILABLE', blockId: block.id, message: 'Image asset is unavailable for print.', severity: 'ERROR', suggestion: 'Select an active approved image.' });
    }
    if (block.type === 'MEETING_PROGRAM' && !data.meetingItems.length && block.visibility !== 'HIDE_WHEN_EMPTY') warnings.push({ code: 'EMPTY_PROGRAM', blockId: block.id, message: 'The program block has no resolved items.', severity: 'WARNING' });
  }
  return { valid: errors.length === 0, errors, warnings, pageCount, foldGuidance: getFoldGuidance(layout.fold), metadata: metadata(layout, data, pageCount) };
}
