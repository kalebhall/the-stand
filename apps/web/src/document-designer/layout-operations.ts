import { idSchema } from './primitives';
import { parseAdvancedLayout, type AdvancedBlock, type AdvancedDocumentLayout, type ColumnCount, type ColumnRatio } from './advanced-schema';
import type { BlockWidth, DocumentBlock } from './types';
import { assertAdvancedMutationAllowed, assertAdvancedMutationAllowedAt } from './lock-enforcement';

const newId = () => idSchema.parse(globalThis.crypto.randomUUID());

function locate(layout: AdvancedDocumentLayout, blockId: string) {
  for (const [pageIndex, page] of layout.pages.entries()) for (const [regionIndex, region] of page.regions.entries()) {
    const blockIndex = region.blocks.findIndex((block) => block.id === blockId);
    if (blockIndex >= 0) return { pageIndex, regionIndex, blockIndex };
  }
  return null;
}

function clone(layout: AdvancedDocumentLayout): AdvancedDocumentLayout {
  return structuredClone(layout);
}

export function addBlock(layout: AdvancedDocumentLayout, pageIndex: number, regionIndex: number, block: DocumentBlock, column = 0): AdvancedDocumentLayout {
  assertAdvancedMutationAllowedAt(layout, 'ADD', undefined, pageIndex, regionIndex);
  const next = clone(layout);
  const region = next.pages[pageIndex]?.regions[regionIndex];
  if (!region || column < 0 || column >= region.columns.count) throw new Error('Invalid target region or column');
  const advancedBlock = structuredClone(block) as AdvancedBlock;
  region.blocks.push(advancedBlock);
  region.columns.blockIds[column].push(advancedBlock.id);
  return parseAdvancedLayout(next);
}

export function removeBlock(layout: AdvancedDocumentLayout, blockId: string): AdvancedDocumentLayout {
  assertAdvancedMutationAllowed(layout, 'REMOVE', blockId);
  const next = clone(layout);
  const position = locate(next, blockId);
  if (!position) return next;
  const region = next.pages[position.pageIndex].regions[position.regionIndex];
  region.blocks.splice(position.blockIndex, 1);
  for (const ids of region.columns.blockIds) {
    const index = ids.indexOf(blockId);
    if (index >= 0) ids.splice(index, 1);
  }
  return parseAdvancedLayout(next);
}

export function moveBlockToColumn(layout: AdvancedDocumentLayout, blockId: string, targetPage: number, targetRegion: number, targetColumn: number): AdvancedDocumentLayout {
  assertAdvancedMutationAllowed(layout, 'MOVE', blockId);
  const next = clone(layout);
  const position = locate(next, blockId);
  const destination = next.pages[targetPage]?.regions[targetRegion];
  if (!position || !destination || targetColumn < 0 || targetColumn >= destination.columns.count) throw new Error('Invalid block move target');
  const source = next.pages[position.pageIndex].regions[position.regionIndex];
  const [block] = source.blocks.splice(position.blockIndex, 1);
  for (const ids of source.columns.blockIds) {
    const index = ids.indexOf(blockId);
    if (index >= 0) ids.splice(index, 1);
  }
  destination.blocks.push(block);
  destination.columns.blockIds[targetColumn].push(blockId);
  return parseAdvancedLayout(next);
}

export function setAdvancedBlockVisibility(layout: AdvancedDocumentLayout, blockId: string, visibility: DocumentBlock['visibility']): AdvancedDocumentLayout {
  assertAdvancedMutationAllowed(layout, 'VISIBILITY', blockId);
  const next = clone(layout);
  const position = locate(next, blockId);
  if (!position) return next;
  next.pages[position.pageIndex].regions[position.regionIndex].blocks[position.blockIndex].visibility = visibility;
  return parseAdvancedLayout(next);
}

export function reorderBlock(layout: AdvancedDocumentLayout, blockId: string, direction: -1 | 1): AdvancedDocumentLayout {
  assertAdvancedMutationAllowed(layout, 'MOVE', blockId);
  const next = clone(layout);
  const position = locate(next, blockId);
  if (!position) return next;
  const region = next.pages[position.pageIndex].regions[position.regionIndex];
  const target = position.blockIndex + direction;
  if (target < 0 || target >= region.blocks.length) return next;
  [region.blocks[position.blockIndex], region.blocks[target]] = [region.blocks[target], region.blocks[position.blockIndex]];
  const column = region.columns.blockIds.find((ids) => ids.includes(blockId));
  if (column) {
    const index = column.indexOf(blockId);
    const targetColumnIndex = index + direction;
    if (targetColumnIndex >= 0 && targetColumnIndex < column.length) [column[index], column[targetColumnIndex]] = [column[targetColumnIndex], column[index]];
  }
  return parseAdvancedLayout(next);
}

export function resizeBlock(layout: AdvancedDocumentLayout, blockId: string, width: BlockWidth): AdvancedDocumentLayout {
  assertAdvancedMutationAllowed(layout, 'RESIZE', blockId);
  const next = clone(layout);
  const position = locate(next, blockId);
  if (!position) return next;
  next.pages[position.pageIndex].regions[position.regionIndex].blocks[position.blockIndex].width = width;
  return parseAdvancedLayout(next);
}

export function configureColumns(layout: AdvancedDocumentLayout, pageIndex: number, regionIndex: number, count: ColumnCount, ratio: ColumnRatio, gutter: number): AdvancedDocumentLayout {
  assertAdvancedMutationAllowedAt(layout, 'COLUMNS', undefined, pageIndex, regionIndex);
  const next = clone(layout);
  const region = next.pages[pageIndex]?.regions[regionIndex];
  if (!region) throw new Error('Invalid region');
  const ids = region.columns.blockIds.flat();
  const blockIds = Array.from({ length: count }, () => [] as string[]);
  ids.forEach((id, index) => blockIds[index % count].push(id));
  region.columns = { count, ratio, gutter, blockIds };
  region.gutter = gutter;
  return parseAdvancedLayout(next);
}

export function setBlockStyle(layout: AdvancedDocumentLayout, blockId: string, styleOverrides: AdvancedBlock['styleOverrides']): AdvancedDocumentLayout {
  assertAdvancedMutationAllowed(layout, 'STYLE', blockId);
  const next = clone(layout);
  const position = locate(next, blockId);
  if (!position) return next;
  const block = next.pages[position.pageIndex].regions[position.regionIndex].blocks[position.blockIndex];
  block.styleOverrides = { ...block.styleOverrides, ...styleOverrides };
  return parseAdvancedLayout(next);
}

export function createBlankAdvancedLayout(): AdvancedDocumentLayout {
  const id = newId();
  const pageId = newId();
  const regionId = newId();
  return parseAdvancedLayout({
    id,
    schemaVersion: 2,
    documentType: 'SACRAMENT_PROGRAM',
    paper: 'LETTER',
    orientation: 'PORTRAIT',
    fold: 'NONE',
    theme: { fontFamily: 'SYSTEM_SANS', baseFontSize: 12, accentColor: '#1f2937' },
    pages: [{ id: pageId, regions: [{ id: regionId, ratio: 1, gutter: 0, blocks: [], columns: { count: 1, ratio: '1/1', gutter: 0, blockIds: [[]] } }] }]
  });
}
