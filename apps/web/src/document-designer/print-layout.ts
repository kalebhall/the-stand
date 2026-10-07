import type { DocumentLayout, FoldType, Orientation, PaperSize } from './types';

export type PhysicalPage = {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
};

export type Panel = { index: number; xMm: number; yMm: number; widthMm: number; heightMm: number };

/** Shared logical-region to physical-panel mapping for folded output. */
export function getFoldRegionPlacement(fold: DocumentLayout['fold'], regionIndex: number): { sideIndex: number; slotIndex: number } {
  if (fold === 'BIFOLD' || fold === 'HALF_SHEET') {
    const map = [
      { sideIndex: 0, slotIndex: 1 },
      { sideIndex: 1, slotIndex: 0 },
      { sideIndex: 1, slotIndex: 1 },
      { sideIndex: 0, slotIndex: 0 }
    ];
    return map[regionIndex] ?? { sideIndex: Math.floor(regionIndex / 2) % 2, slotIndex: regionIndex % 2 };
  }
  const panelCount = fold === 'TRIFOLD' ? 3 : 1;
  return { sideIndex: Math.floor(regionIndex / panelCount) % 2, slotIndex: regionIndex % panelCount };
}

const PAPER_MM: Record<PaperSize, [number, number]> = {
  LETTER: [215.9, 279.4],
  A4: [210, 297]
};

export function getPhysicalPage(paper: PaperSize, orientation: Orientation): PhysicalPage {
  const [short, long] = PAPER_MM[paper];
  const landscape = orientation === 'LANDSCAPE';
  const widthMm = landscape ? long : short;
  const heightMm = landscape ? short : long;
  const marginMm = 12.7;
  return { widthMm, heightMm, marginMm, contentWidthMm: widthMm - marginMm * 2, contentHeightMm: heightMm - marginMm * 2 };
}

export function getFoldPanels(layout: Pick<DocumentLayout, 'paper' | 'orientation' | 'fold'>): Panel[] {
  const page = getPhysicalPage(layout.paper, layout.orientation);
  const count = layout.fold === 'TRIFOLD' ? 3 : layout.fold === 'BIFOLD' || layout.fold === 'HALF_SHEET' ? 2 : 1;
  const panelWidth = page.contentWidthMm / count;
  return Array.from({ length: count }, (_, index) => ({
    index,
    xMm: page.marginMm + index * panelWidth,
    yMm: page.marginMm,
    widthMm: panelWidth,
    heightMm: page.contentHeightMm
  }));
}

export function getExpectedPageCount(layout: Pick<DocumentLayout, 'fold'>, flowingPages = 1): number {
  return layout.fold === 'NONE' ? Math.max(1, flowingPages) : Math.max(2, flowingPages);
}

export function getFoldGuidance(fold: FoldType): string[] {
  if (fold === 'BIFOLD') return ['Print double-sided, flip on the short edge, then fold at the center.'];
  if (fold === 'TRIFOLD') return ['Print double-sided, flip on the short edge, then fold into three panels.'];
  if (fold === 'HALF_SHEET') return ['Print double-sided and cut or fold at the center line.'];
  return [];
}
