import { jsPDF } from 'jspdf';

import { generateQrDataUrl } from '../lib/qr-pdf';
import { allBlocks } from './public-safety';
import { isAdvancedLayout, type AdvancedBlock, type AdvancedDocumentLayout } from './advanced-schema';
import { getPhysicalPage, getFoldPanels, getFoldRegionPlacement } from './print-layout';
import type { PrintRenderMetadata } from './print-types';
import type { DocumentBlock, DocumentLayout } from './types';
import type { ResolvedDocumentData } from './render-types';
import { safeUrlSchema } from './primitives';
import { formatMeetingProgramPdfRows, meetingProgramPresentation } from './meeting-program-presentation';
import { announcementListPresentation, orderedAnnouncementItems } from './announcement-list-presentation';
import { orderedSimpleListItems, sectionHeadingPresentation, simpleListPresentation } from './structural-block-presentation';

function safePrintHref(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const isLoopbackHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (url.protocol === 'https:' || isLoopbackHttp) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export type PdfRenderOptions = { metadata: PrintRenderMetadata; title?: string };

function blockText(block: DocumentBlock, data: ResolvedDocumentData, includeLeadershipInProgram = true): string {
  const resolvedBlockText = data.blockValues?.[String(block.id)];
  if (typeof resolvedBlockText === 'string') return resolvedBlockText;
  if (block.type === 'PRESIDING_CONDUCTING') {
    let leadership: { presiding?: string; conducting?: string } = {};
    try {
      leadership = JSON.parse(data.values.PRESIDING_CONDUCTING ?? '{}') as typeof leadership;
    } catch {
      leadership = {};
    }
    return [
      [data.renderLabels?.presiding ?? 'Presiding', leadership.presiding ?? ''],
      [data.renderLabels?.conducting ?? 'Conducting', leadership.conducting ?? '']
    ]
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');
  }
  if (block.type === 'MEETING_PROGRAM') {
    const presentation = meetingProgramPresentation((block.config as { presentation?: unknown }).presentation);
    let leadership: { presiding?: string; conducting?: string } = {};
    try {
      leadership = JSON.parse(data.values.PRESIDING_CONDUCTING ?? '{}') as typeof leadership;
    } catch {
      leadership = {};
    }
    const leadershipRows = includeLeadershipInProgram
      ? [
          [data.renderLabels?.presiding ?? 'Presiding', leadership.presiding ?? ''],
          [data.renderLabels?.conducting ?? 'Conducting', leadership.conducting ?? '']
        ]
      : [];
    const rows = [
      ...leadershipRows,
      ...data.meetingItems
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => [item.label, item.details?.trim() || '—'] as const)
    ]
      .filter(([, value]) => value.trim())
      .map(([label, value]) => ({ label, value }));
    const formattedRows = formatMeetingProgramPdfRows(rows, presentation);
    return formattedRows.length ? [data.renderLabels?.programTitle ?? 'Program', ...formattedRows].join('\n') : '';
  }
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

export async function renderDocumentPdf(
  layout: DocumentLayout | AdvancedDocumentLayout,
  data: ResolvedDocumentData,
  options: PdfRenderOptions
): Promise<jsPDF> {
  const page = getPhysicalPage(layout.paper, layout.orientation);
  const doc = new jsPDF({
    orientation: layout.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: layout.paper === 'A4' ? 'a4' : 'letter',
    compress: false
  });
  const font = fontName(layout);
  const panels = getFoldPanels(layout);
  const fold = layout.fold !== 'NONE';
  let panelIndex = 0;
  let panelSlot = 0;
  let columnCount = 1;
  let columnIndex = 0;
  let columnRatio: '1/1' | '1/3+2/3' | '2/3+1/3' = '1/1';
  let columnGutter = 0;
  let y = page.marginMm;
  const lineHeight = Math.max(4, layout.theme.baseFontSize * 0.42);
  const bottom = page.heightMm - page.marginMm;
  let activeBottom = bottom;
  let activeRegionTop = page.marginMm;

  const currentPanel = () => panels[fold ? panelIndex : 0] ?? panels[0];

  const baseColumnWidth = () => (fold ? currentPanel().widthMm : page.contentWidthMm);
  const columnWidths = () => {
    const available = baseColumnWidth() - columnGutter * Math.max(0, columnCount - 1);
    if (columnCount === 1) return [available];
    if (columnCount === 3) return [available / 3, available / 3, available / 3];
    return columnRatio === '1/3+2/3'
      ? [available / 3, (available * 2) / 3]
      : columnRatio === '2/3+1/3'
        ? [(available * 2) / 3, available / 3]
        : [available / 2, available / 2];
  };
  const currentX = () => {
    const widths = columnWidths();
    const slotX = fold ? currentPanel().xMm + panelSlot * baseColumnWidth() : page.marginMm;
    const columnOffset = widths.slice(0, columnIndex).reduce((sum, width) => sum + width + columnGutter, 0);
    return slotX + columnOffset;
  };
  const currentWidth = () =>
    Math.max(1, (columnWidths()[columnIndex] - 6) * ({ FULL: 1, TWO_THIRDS: 2 / 3, HALF: 1 / 2, ONE_THIRD: 1 / 3 }[activeBlockWidth] ?? 1));
  const advanceColumn = () => {
    if (fold && panelIndex < panels.length - 1) {
      panelIndex += 1;
      y = page.marginMm;
      activeBottom = bottom;
      activeRegionTop = page.marginMm;
      return;
    }
    doc.addPage();
    currentPhysicalPage += 1;
    panelIndex = 0;
    y = page.marginMm;
    activeBottom = bottom;
    activeRegionTop = page.marginMm;
  };
  const ensureSpace = (required: number) => {
    if (y + required <= activeBottom) return;
    advanceColumn();
  };
  const writeText = (text: string, size = layout.theme.baseFontSize, bold = false, style?: AdvancedBlock['styleOverrides']) => {
    if (!text) return;
    doc.setFont(style?.fontFamily === 'SERIF' ? 'times' : style?.fontFamily === 'MONOSPACE' ? 'courier' : font, bold ? 'bold' : 'normal');
    doc.setFontSize(style?.fontSize ?? size);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(text, currentWidth()) as string[];
    const effectiveLineHeight = Math.max(4, (style?.fontSize ?? size) * 0.42);
    const spacing = style?.spacing ?? 0;
    ensureSpace(lines.length * effectiveLineHeight + spacing + 3);
    const afterMoveLines = doc.splitTextToSize(text, currentWidth()) as string[];
    const textWidth = currentWidth();
    const align = style?.align === 'CENTER' ? 'center' : style?.align === 'RIGHT' ? 'right' : 'left';
    const textX = align === 'center' ? currentX() + textWidth / 2 : align === 'right' ? currentX() + textWidth : currentX();
    const startY = y;
    doc.text(afterMoveLines, textX, y, { align });
    const height = afterMoveLines.length * effectiveLineHeight + spacing;
    if (style?.border && style.border !== 'NONE') {
      doc.setLineWidth(0.3);
      if (style.border === 'DOTTED') doc.setLineDashPattern([0.8, 0.8], 0);
      doc.rect(currentX(), startY - effectiveLineHeight + 1, textWidth, height + 2);
      doc.setLineDashPattern([], 0);
    }
    y += height + 3;
  };

  const advancedRegions = isAdvancedLayout(layout) ? layout.pages.flatMap((page) => page.regions) : [];
  const renderBlocks = isAdvancedLayout(layout)
    ? layout.pages
        .flatMap((documentPage, pageIndex) =>
          documentPage.regions.flatMap((region, regionIndex) => {
            const { sideIndex, slotIndex } = getFoldRegionPlacement(layout.fold, regionIndex, region.face);
            return region.columns.blockIds.flatMap((ids, columnIndex) =>
              ids.flatMap((id) => {
                const block = region.blocks.find((candidate) => candidate.id === id);
                return block
                  ? [{ block, regionKey: region.id, regionIndex, regionRatio: region.ratio, pageIndex, sideIndex, slotIndex, columnIndex }]
                  : [];
              })
            );
          })
        )
        .sort((a, b) => a.pageIndex - b.pageIndex || a.sideIndex - b.sideIndex || a.slotIndex - b.slotIndex)
    : allBlocks(layout).map((block) => ({
        block,
        regionKey: 'legacy',
        regionIndex: 0,
        regionRatio: 1,
        pageIndex: 0,
        sideIndex: 0,
        slotIndex: 0,
        columnIndex: 0
      }));
  const includeLeadershipInProgram = !renderBlocks.some(
    ({ block }) => block.type === 'PRESIDING_CONDUCTING' && block.visibility !== 'HIDDEN' && block.printBehavior !== 'DIGITAL_ONLY'
  );
  let currentPhysicalPage = 0;
  let lastRegionKey: string | null = null;
  let lastColumnIndex = 0;
  let activeBlockWidth: AdvancedBlock['width'] = 'FULL';
  for (const item of renderBlocks) {
    if (item.regionKey !== lastRegionKey) {
      const targetPhysicalPage = isAdvancedLayout(layout) && layout.fold !== 'NONE' ? item.pageIndex * 2 + item.sideIndex : item.pageIndex;
      const movedPhysicalPage = targetPhysicalPage > currentPhysicalPage;
      while (targetPhysicalPage > currentPhysicalPage) {
        doc.addPage();
        currentPhysicalPage += 1;
      }
      panelIndex = item.slotIndex;
      panelSlot = 0;
      if (isAdvancedLayout(layout)) {
        const region = advancedRegions.find((candidate) => candidate.id === item.regionKey);
        columnCount = region?.columns.count ?? 1;
        columnRatio = region?.columns.ratio ?? '1/1';
        columnGutter = region?.columns.gutter ?? 0;
        columnIndex = 0;
      } else {
        columnCount = 1;
        columnIndex = 0;
        columnRatio = '1/1';
        columnGutter = 0;
      }
      if (!isAdvancedLayout(layout) || layout.fold !== 'NONE' || movedPhysicalPage) {
        y = page.marginMm;
      }
      if (isAdvancedLayout(layout) && layout.fold === 'NONE') {
        const currentPage = layout.pages[item.pageIndex];
        const regionTopRatio = currentPage?.regions.slice(0, item.regionIndex).reduce((sum, region) => sum + region.ratio, 0) ?? 0;
        const regionTop = page.marginMm + page.contentHeightMm * regionTopRatio;
        activeRegionTop = regionTop;
        activeBottom = regionTop + page.contentHeightMm * item.regionRatio;
        y = Math.max(y, regionTop);
      } else {
        activeBottom = bottom;
      }
      lastRegionKey = item.regionKey;
      lastColumnIndex = item.columnIndex;
    } else if (item.columnIndex !== lastColumnIndex) {
      y = activeRegionTop;
      lastColumnIndex = item.columnIndex;
    }
    columnIndex = item.columnIndex;
    const block = item.block;
    const blockStyle = (block as AdvancedBlock).styleOverrides;
    activeBlockWidth = block.width;
    if (block.visibility === 'HIDDEN' || block.printBehavior === 'DIGITAL_ONLY') continue;
    if (block.type === 'IMAGE') {
      const assetId = (block.config as { assetId: string | null }).assetId;
      const asset = assetId ? data.media?.[assetId] : undefined;
      const usableAsset =
        asset && (asset.url.startsWith('data:image/') || asset.url.startsWith('/media/') || safeUrlSchema.safeParse(asset.url).success);
      if (!usableAsset && block.visibility === 'HIDE_WHEN_EMPTY') continue;
      if (asset?.url?.startsWith('data:image/')) {
        const imageHeight = Math.min(35, currentWidth() * 0.6);
        ensureSpace(imageHeight + 4);
        const imageFormat = asset.url.startsWith('data:image/jpeg') ? 'JPEG' : asset.url.startsWith('data:image/webp') ? 'WEBP' : 'PNG';
        doc.addImage(asset.url, imageFormat, currentX(), y, currentWidth(), imageHeight, undefined, 'FAST');
        y += imageHeight + 4;
      } else writeText('[Approved image]', layout.theme.baseFontSize, false);
      continue;
    }
    if (block.type === 'QR_CODE') {
      const config = block.config as { href?: unknown; label?: unknown };
      const href = safePrintHref(config.href) ? config.href : safePrintHref(data.publicUrl) ? data.publicUrl : null;
      if (!href) continue;
      const label =
        typeof config.label === 'string' && config.label.trim()
          ? config.label.trim()
          : (data.renderLabels?.qrDigitalProgram ?? 'Digital program');
      const caption = `${label}: ${href}`;
      const captionSize = Math.max(8, layout.theme.baseFontSize - 1);
      const qrDataUrl = await generateQrDataUrl(href);
      const qrSize = Math.min(45, currentWidth());
      doc.setFontSize(captionSize);
      const captionLines = doc.splitTextToSize(caption, currentWidth()).length;
      ensureSpace(qrSize + 3 + captionLines * lineHeight + 3);
      doc.addImage(qrDataUrl, 'PNG', currentX(), y, qrSize, qrSize, undefined, 'FAST');
      y += qrSize + 3;
      writeText(caption, captionSize, false);
      continue;
    }
    if (block.type === 'CUSTOM_LINK') {
      const config = block.config as { href?: unknown; label?: unknown };
      const href = safePrintHref(config.href) ? config.href : null;
      if (!href) continue;
      const label = typeof config.label === 'string' && config.label.trim() ? config.label.trim() : 'Link';
      writeText(`${label}: ${href}`, layout.theme.baseFontSize, false);
      continue;
    }
    if (block.type === 'ANNOUNCEMENT_LIST') {
      const items = orderedAnnouncementItems(block.config.items);
      if (!items.length && block.visibility === 'HIDE_WHEN_EMPTY') continue;
      const labels = data.renderLabels;
      const presentation = announcementListPresentation(block.config.presentation);
      writeText(labels?.announcements ?? 'Announcements', layout.theme.baseFontSize + 3, true, blockStyle);
      for (const item of items) {
        const dateTimeFields: Array<[string, string | undefined]> = [
          [labels?.announcementDate ?? 'Date', item.date],
          [labels?.announcementTime ?? 'Time', item.time]
        ].filter(([, value]) => Boolean(value?.trim())) as Array<[string, string | undefined]>;
        const placeContactFields: Array<[string, string | undefined]> = [
          [labels?.announcementLocation ?? 'Location', item.location],
          [labels?.announcementContact ?? 'Contact', item.contact]
        ].filter(([, value]) => Boolean(value?.trim())) as Array<[string, string | undefined]>;
        const formatField = ([label, value]: [string, string | undefined]) => `${label}: ${value!.trim()}`;
        const labeledFields = [...dateTimeFields, ...placeContactFields].map(formatField);
        if (presentation === 'COMPACT_ROWS') {
          writeText(item.title, layout.theme.baseFontSize, true, blockStyle);
          const dateTime = dateTimeFields.map(formatField).join(' · ');
          const placeContact = placeContactFields.map(formatField).join(' · ');
          for (const line of [dateTime, placeContact, item.description?.trim()].filter((value): value is string => Boolean(value)))
            writeText(line, layout.theme.baseFontSize - 1, false, blockStyle);
          continue;
        }

        const description = item.description?.trim();
        const cardText = [item.title, ...labeledFields, ...(description ? [description] : [])];
        const cardLineHeight = Math.max(4, (blockStyle?.fontSize ?? layout.theme.baseFontSize + 1) * 0.42);
        const cardLineCount = cardText.reduce((total, text) => total + (doc.splitTextToSize(text, currentWidth()) as string[]).length, 0);
        ensureSpace(cardLineCount * cardLineHeight + cardText.length * 3 + 5);
        const cardPage = currentPhysicalPage;
        const cardPanel = panelIndex;
        const cardColumn = columnIndex;
        const cardX = currentX();
        const cardY = y;
        const cardWidth = currentWidth();
        writeText(item.title, layout.theme.baseFontSize + 1, true, blockStyle);
        for (const line of labeledFields) writeText(line, layout.theme.baseFontSize - 1, false, blockStyle);
        if (description) writeText(description, layout.theme.baseFontSize, false, blockStyle);
        if (cardPage === currentPhysicalPage && cardPanel === panelIndex && cardColumn === columnIndex) {
          doc.setPage(cardPage + 1);
          doc.setLineWidth(0.3);
          doc.rect(cardX, cardY - cardLineHeight + 1, cardWidth, y - cardY + cardLineHeight);
          doc.setPage(currentPhysicalPage + 1);
        }
      }
      continue;
    }
    if (block.type === 'SECTION_HEADING') {
      const presentation = sectionHeadingPresentation(block.config.presentation);
      const headingX = currentX();
      const headingY = y;
      writeText(block.config.title.trim(), layout.theme.baseFontSize + 3, true, blockStyle);
      if (block.config.subtitle?.trim()) writeText(block.config.subtitle.trim(), layout.theme.baseFontSize, false, blockStyle);
      if (presentation === 'RULE') {
        doc.setLineWidth(0.3);
        doc.line(headingX, y - 1, headingX + currentWidth(), y - 1);
      } else if (presentation === 'ACCENT') {
        doc.setLineWidth(1.2);
        doc.line(headingX, headingY - 1, headingX, Math.max(headingY, y - 3));
      }
      continue;
    }
    if (block.type === 'SIMPLE_LIST') {
      const presentation = simpleListPresentation(block.config.presentation);
      const items = orderedSimpleListItems(block.config.items);
      if (!items.length && block.visibility === 'HIDE_WHEN_EMPTY') continue;
      for (const [index, item] of items.entries()) {
        const prefix = presentation === 'NUMBERED' ? `${index + 1}. ` : presentation === 'BULLETS' ? '- ' : '';
        writeText(`${prefix}${item.text.trim()}`, layout.theme.baseFontSize, false, blockStyle);
        if (presentation === 'COMPACT_ROWS') {
          doc.setLineWidth(0.2);
          doc.line(currentX(), y - 1, currentX() + currentWidth(), y - 1);
        }
      }
      continue;
    }
    if (block.type === 'SPACER') {
      const height = Math.min(20, Number((block.config as { height: number }).height) / 3);
      ensureSpace(height);
      y += height;
      continue;
    }
    const text = blockText(block, data, includeLeadershipInProgram);
    if (block.visibility === 'HIDE_WHEN_EMPTY' && !text.trim()) continue;
    if (block.type === 'MEETING_PROGRAM') {
      const [title, ...rows] = text.split('\n');
      writeText(title || 'Program', layout.theme.baseFontSize + 3, true, blockStyle);
      const presentation = meetingProgramPresentation((block.config as { presentation?: unknown }).presentation);
      if (rows.length)
        writeText(
          rows.join('\n'),
          layout.theme.baseFontSize,
          false,
          presentation === 'CENTERED_STACKED' ? { ...blockStyle, align: 'CENTER' } : blockStyle
        );
      continue;
    }
    const heading = block.type === 'DOCUMENT_TITLE' || block.type === 'WARD_NAME' || block.type === 'MEETING_INFO';
    writeText(text || '—', heading ? layout.theme.baseFontSize + 3 : layout.theme.baseFontSize, heading, blockStyle);
  }

  const expectedPhysicalPages = isAdvancedLayout(layout)
    ? fold
      ? Math.max(2, layout.pages.length * 2)
      : Math.max(1, layout.pages.length)
    : fold
      ? 2
      : 1;
  while (doc.getNumberOfPages() < expectedPhysicalPages) doc.addPage();
  doc.setCreationDate(new Date('2000-01-01T00:00:00.000Z'));
  doc.setFileId(
    options.metadata.layoutHash
      .replace(/[^A-Za-z0-9]/g, '')
      .padEnd(32, '0')
      .slice(0, 32)
  );
  doc.setProperties({
    title: options.title ?? 'Meeting Program',
    subject: 'The Stand program',
    author: 'The Stand',
    creator: `The Stand ${options.metadata.rendererVersion}`
  });
  return doc;
}
