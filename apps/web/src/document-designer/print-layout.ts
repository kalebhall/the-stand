import type { DocumentLayout, DocumentRegionFace, FoldType, Orientation, PaperSize } from './types';

export type PhysicalPage = {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
};

export type Panel = { index: number; xMm: number; yMm: number; widthMm: number; heightMm: number };

const BIFOLD_FACES = ['FRONT_COVER', 'INSIDE_LEFT', 'INSIDE_RIGHT', 'BACK_COVER'] as const satisfies readonly DocumentRegionFace[];
const TRIFOLD_FACES = ['FRONT_COVER', 'FOLD_IN_FLAP', 'BACK_COVER', 'INSIDE_LEFT', 'INSIDE_CENTER', 'INSIDE_RIGHT'] as const satisfies readonly DocumentRegionFace[];
const HALF_SHEET_FACES = ['FRONT_COVER', 'INSIDE_LEFT', 'INSIDE_RIGHT', 'BACK_COVER'] as const satisfies readonly DocumentRegionFace[];

export function getFoldRegionFace(fold: DocumentLayout['fold'], regionIndex: number): DocumentRegionFace | undefined {
  if (fold === 'BIFOLD') return BIFOLD_FACES[regionIndex];
  if (fold === 'TRIFOLD') return TRIFOLD_FACES[regionIndex];
  if (fold === 'HALF_SHEET') return HALF_SHEET_FACES[regionIndex];
  return undefined;
}

export function getFoldFaceLabelKey(face: DocumentRegionFace | undefined):
  | 'frontCover'
  | 'insideLeft'
  | 'insideRight'
  | 'backCover'
  | 'foldInFlap'
  | 'insideCenter'
  | undefined {
  if (face === 'FRONT_COVER') return 'frontCover';
  if (face === 'INSIDE_LEFT') return 'insideLeft';
  if (face === 'INSIDE_RIGHT') return 'insideRight';
  if (face === 'BACK_COVER') return 'backCover';
  if (face === 'FOLD_IN_FLAP') return 'foldInFlap';
  if (face === 'INSIDE_CENTER') return 'insideCenter';
  return undefined;
}

export function validateFoldRegionFaces(layout: Pick<DocumentLayout, 'fold' | 'pages'>): void {
  if (layout.fold === 'NONE') return;
  const capacity = layout.fold === 'TRIFOLD' ? 6 : 4;
  const expectedFaces = new Set(Array.from({ length: capacity }, (_, index) => getFoldRegionFace(layout.fold, index)));
  for (const [pageIndex, page] of layout.pages.entries()) {
    const seen = new Set<string>();
    for (const region of page.regions) {
      if (!region.face) continue;
      if (!expectedFaces.has(region.face)) throw new Error(`Invalid ${layout.fold} face on page ${pageIndex + 1}`);
      if (seen.has(region.face)) throw new Error(`Duplicate ${layout.fold} face ${region.face} on page ${pageIndex + 1}`);
      seen.add(region.face);
    }
  }
}

/** Shared logical-region to physical-panel mapping for folded output. */
export function getFoldRegionPlacement(
  fold: DocumentLayout['fold'],
  regionIndex: number,
  face?: DocumentRegionFace
): { sideIndex: number; slotIndex: number } {
  const semanticIndex = face ? getFoldFaceIndex(fold, face) : undefined;
  const index = semanticIndex ?? regionIndex;
  if (fold === 'BIFOLD' || fold === 'HALF_SHEET') {
    const map = [
      { sideIndex: 0, slotIndex: 1 },
      { sideIndex: 1, slotIndex: 0 },
      { sideIndex: 1, slotIndex: 1 },
      { sideIndex: 0, slotIndex: 0 }
    ];
    return map[index] ?? { sideIndex: Math.floor(index / 2) % 2, slotIndex: index % 2 };
  }
  const panelCount = fold === 'TRIFOLD' ? 3 : 1;
  return { sideIndex: Math.floor(index / panelCount) % 2, slotIndex: index % panelCount };
}

function getFoldFaceIndex(fold: DocumentLayout['fold'], face: DocumentRegionFace): number | undefined {
  const faces = fold === 'BIFOLD' ? BIFOLD_FACES : fold === 'TRIFOLD' ? TRIFOLD_FACES : fold === 'HALF_SHEET' ? HALF_SHEET_FACES : [];
  const index = faces.indexOf(face as never);
  return index >= 0 ? index : undefined;
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
