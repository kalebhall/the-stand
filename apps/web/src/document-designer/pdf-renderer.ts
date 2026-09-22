import { jsPDF } from 'jspdf';

import { allBlocks } from './public-safety';
import { isAdvancedLayout, type AdvancedDocumentLayout } from './advanced-schema';
import { getPhysicalPage, getFoldPanels } from './print-layout';
import type { PrintRenderMetadata } from './print-types';
import type { DocumentBlock, DocumentLayout } from './types';
import type { ResolvedDocumentData } from './render-types';

export type PdfRenderOptions = { metadata: PrintRenderMetadata; title?: string };

function blockText(block: DocumentBlock, data: ResolvedDocumentData): string {
  if (block.type === 'MEETING_PROGRAM') return data.meetingItems.slice().sort((a, b) => a.order - b.order).map((item, index) => `${index + 1}. ${item.label}${item.details ? ` — ${item.details}` : ''}`).join('\n');
  if (block.type === 'DIVIDER') return '────────────────────────';
  if (block.type === 'SPACER' || block.type === 'IMAGE' || block.type === 'QR_CODE') return '';
  const resolved = data.values[block.type];
  if (typeof resolved === 'string') return resolved;
  const config = block.config as { text?: string; label?: string };
  return config.text ?? config.label ?? '';
}

function fontName(layout: Pick<DocumentLayout, 'theme'> | Pick<AdvancedDocumentLayout, 'theme'>): 'helvetica' | 'times' | 'courier' {
  if (layout.theme.fontFamily === 'SERIF') return 'times';
  if (layout.theme.fontFamily === 'MONOSPACE') return 'courier';
  return 'helvetica';
}

export async function renderDocumentPdf(layout: DocumentLayout | AdvancedDocumentLayout, data: ResolvedDocumentData, options: PdfRenderOptions): Promise<jsPDF> {
  const page = getPhysicalPage(layout.paper, layout.orientation);
  const doc = new jsPDF({ orientation: layout.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait', unit: 'mm', format: layout.paper === 'A4' ? 'a4' : 'letter', compress: false });
  const font = fontName(layout);
  const panels = getFoldPanels(layout);
  const fold = layout.fold !== 'NONE';
  let panelIndex = 0;
  let panelSlot = 0;
  let columnCount = 1;
  let columnIndex = 0;
  let columnRatio: '1/1' | '1/3+2/3' | '2/3+1/3' = '1/1';
  let y = page.marginMm;
  const lineHeight = Math.max(4, layout.theme.baseFontSize * 0.42);
  const bottom = page.heightMm - page.marginMm;

  const currentPanel = () => panels[fold ? panelIndex : 0] ?? panels[0];
  const columnFraction = () => columnCount === 1 ? 1 : columnCount === 3 ? 1 / 3 : columnRatio === '1/3+2/3' ? (columnIndex === 0 ? 1 / 3 : 2 / 3) : columnRatio === '2/3+1/3' ? (columnIndex === 0 ? 2 / 3 : 1 / 3) : 1 / 2;
  const currentX = () => {
    const logicalWidth = fold ? currentPanel().widthMm / 2 : page.contentWidthMm;
    const slotX = fold ? currentPanel().xMm + panelSlot * logicalWidth : page.marginMm;
    const columnOffset = columnCount === 1 ? 0 : columnCount === 3 ? logicalWidth * columnIndex / 3 : columnIndex === 0 ? 0 : logicalWidth * (columnRatio === '1/3+2/3' ? 1 / 3 : columnRatio === '2/3+1/3' ? 2 / 3 : 1 / 2);
    return slotX + columnOffset;
  };
  const currentWidth = () => (fold ? currentPanel().widthMm / 2 : page.contentWidthMm) * columnFraction() - 6;
  const advanceColumn = () => {
    if (fold && panelIndex < panels.length - 1) {
      panelIndex += 1;
      y = page.marginMm;
      return;
    }
    doc.addPage();
    panelIndex = 0;
    y = page.marginMm;
  };
  const ensureSpace = (required: number) => {
    if (y + required <= bottom) return;
    advanceColumn();
  };
  const writeText = (text: string, size = layout.theme.baseFontSize, bold = false) => {
    if (!text) return;
    doc.setFont(font, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(text, currentWidth()) as string[];
    ensureSpace(lines.length * lineHeight + 3);
    const afterMoveLines = doc.splitTextToSize(text, currentWidth()) as string[];
    doc.text(afterMoveLines, currentX(), y);
    y += afterMoveLines.length * lineHeight + 3;
  };

  const renderBlocks = isAdvancedLayout(layout)
    ? layout.pages.flatMap((page) => page.regions).map((region, regionIndex) => ({ regionKey: region.id, panelIndex: layout.fold === 'BIFOLD' ? [3, 0, 1, 2][regionIndex] ?? regionIndex % 2 : 0, blocks: region.columns.blockIds.flatMap((ids, columnIndex) => ids.map((id) => ({ block: region.blocks.find((candidate) => candidate.id === id), columnIndex }))).filter((item): item is { block: typeof region.blocks[number]; columnIndex: number } => Boolean(item.block)) })).flatMap(({ regionKey, panelIndex, blocks }) => blocks.map(({ block, columnIndex }) => ({ block, regionKey, panelIndex, columnIndex })))
    : allBlocks(layout).map((block) => ({ block, regionKey: 'legacy', panelIndex: 0, columnIndex: 0 }));
  let lastRegionKey: string | null = null;
  let lastColumnIndex = 0;
  for (const item of renderBlocks) {
    if (item.regionKey !== lastRegionKey) {
      panelIndex = item.panelIndex;
      if (isAdvancedLayout(layout) && layout.fold === 'BIFOLD') {
        const regionIndex = layout.pages.flatMap((page) => page.regions).findIndex((region) => region.id === item.regionKey);
        const bifoldMapping = [[0, 1], [1, 0], [1, 1], [0, 0]] as const;
        const mapped = bifoldMapping[regionIndex];
        if (mapped) { panelIndex = mapped[0]; panelSlot = mapped[1]; } else panelSlot = 0;
      } else panelSlot = 0;
      if (isAdvancedLayout(layout)) {
        const region = layout.pages.flatMap((page) => page.regions).find((candidate) => candidate.id === item.regionKey);
        columnCount = region?.columns.count ?? 1;
        columnRatio = region?.columns.ratio ?? '1/1';
        columnIndex = 0;
      } else { columnCount = 1; columnIndex = 0; columnRatio = '1/1'; }
      y = page.marginMm;
      lastRegionKey = item.regionKey;
      lastColumnIndex = item.columnIndex;
    } else if (item.columnIndex !== lastColumnIndex) {
      y = page.marginMm;
      lastColumnIndex = item.columnIndex;
    }
    columnIndex = item.columnIndex;
    const block = item.block;
    if (block.visibility === 'HIDDEN' || block.printBehavior === 'DIGITAL_ONLY') continue;
    if (block.type === 'IMAGE') {
      const assetId = (block.config as { assetId: string | null }).assetId;
      const asset = assetId ? data.media?.[assetId] : undefined;
      if (asset?.url?.startsWith('data:image/')) {
        const imageHeight = Math.min(35, currentWidth() * 0.6);
        ensureSpace(imageHeight + 4);
        const imageFormat = asset.url.startsWith('data:image/jpeg') ? 'JPEG' : asset.url.startsWith('data:image/webp') ? 'WEBP' : 'PNG';
        doc.addImage(asset.url, imageFormat, currentX(), y, currentWidth(), imageHeight, undefined, 'FAST');
        y += imageHeight + 4;
      } else writeText('[Approved image]', layout.theme.baseFontSize, false);
      continue;
    }
    if (block.type === 'QR_CODE' && data.publicUrl) { writeText(`Digital program: ${data.publicUrl}`, layout.theme.baseFontSize, false); continue; }
    if (block.type === 'SPACER') { const height = Math.min(20, Number((block.config as { height: number }).height) / 3); ensureSpace(height); y += height; continue; }
    const text = blockText(block, data);
    const heading = block.type === 'DOCUMENT_TITLE' || block.type === 'WARD_NAME' || block.type === 'MEETING_INFO';
    writeText(text || '—', heading ? layout.theme.baseFontSize + 3 : layout.theme.baseFontSize, heading);
  }

  doc.setCreationDate(new Date('2000-01-01T00:00:00.000Z'));
  doc.setFileId(options.metadata.layoutHash.replace(/[^A-Za-z0-9]/g, '').padEnd(32, '0').slice(0, 32));
  doc.setProperties({ title: options.title ?? 'Meeting Program', subject: 'The Stand program', author: 'The Stand', creator: `The Stand ${options.metadata.rendererVersion}` });
  return doc;
}
