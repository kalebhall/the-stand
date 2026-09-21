import { jsPDF } from 'jspdf';

import { allBlocks } from './public-safety';
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

function fontName(layout: DocumentLayout): 'helvetica' | 'times' | 'courier' {
  if (layout.theme.fontFamily === 'SERIF') return 'times';
  if (layout.theme.fontFamily === 'MONOSPACE') return 'courier';
  return 'helvetica';
}

export async function renderDocumentPdf(layout: DocumentLayout, data: ResolvedDocumentData, options: PdfRenderOptions): Promise<jsPDF> {
  const page = getPhysicalPage(layout.paper, layout.orientation);
  const doc = new jsPDF({ orientation: layout.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait', unit: 'mm', format: layout.paper === 'A4' ? 'a4' : 'letter', compress: false });
  const font = fontName(layout);
  const panels = getFoldPanels(layout);
  const fold = layout.fold !== 'NONE';
  let panelIndex = 0;
  let y = page.marginMm;
  const lineHeight = Math.max(4, layout.theme.baseFontSize * 0.42);
  const bottom = page.heightMm - page.marginMm;

  const currentPanel = () => panels[fold ? panelIndex : 0] ?? panels[0];
  const currentX = () => fold ? currentPanel().xMm : page.marginMm;
  const currentWidth = () => fold ? currentPanel().widthMm - 6 : page.contentWidthMm;
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

  for (const block of allBlocks(layout)) {
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
