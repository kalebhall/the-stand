import type { AdvancedDocumentLayout } from './advanced-schema';
import type { DocumentBlock, DocumentLayout, LockProperty } from './types';

export type LayoutOperation = 'ADD' | 'REMOVE' | 'MOVE' | 'RESIZE' | 'STYLE' | 'VISIBILITY' | 'CONTENT' | 'COLUMNS' | 'STRUCTURE';

export class LockedLayoutError extends Error {
  constructor(public readonly property: LockProperty | 'STRUCTURE', message: string) {
    super(message);
    this.name = 'LockedLayoutError';
  }
}

function blocked(lock: { properties: readonly string[] } | undefined, property: string): boolean {
  return Boolean(lock?.properties.includes(property));
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function assertLayoutOperationAllowed(layout: DocumentLayout, operation: LayoutOperation, block?: DocumentBlock, previous?: DocumentBlock): void {
  const property = operation === 'RESIZE' ? 'SIZE' : operation === 'STRUCTURE' || operation === 'MOVE' || operation === 'ADD' || operation === 'REMOVE' || operation === 'COLUMNS' ? 'POSITION' : operation;
  if (blocked(layout.lock, property)) throw new LockedLayoutError(property as LockProperty, 'The document property is locked');
  if (blocked(previous?.lock, property) || blocked(block?.lock, property)) throw new LockedLayoutError(property as LockProperty, 'This block property is locked');
}

function locationMap(layout: AdvancedDocumentLayout): Map<string, { page: number; region: number; block: number }> {
  const result = new Map<string, { page: number; region: number; block: number }>();
  layout.pages.forEach((page, pageIndex) => page.regions.forEach((region, regionIndex) => region.blocks.forEach((block, blockIndex) => result.set(block.id, { page: pageIndex, region: regionIndex, block: blockIndex }))));
  return result;
}

function ids<T extends { id: string }>(items: T[]): string[] { return items.map((item) => item.id); }

export function assertAdvancedMutationAllowed(layout: AdvancedDocumentLayout, operation: LayoutOperation, blockId?: string): void {
  const block = blockId ? layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)).find((item) => item.id === blockId) : undefined;
  assertLayoutOperationAllowed(layout as unknown as DocumentLayout, operation, block, block);
}

export function assertNoLockedChanges(previous: AdvancedDocumentLayout, next: AdvancedDocumentLayout): void {
  if (previous.id !== next.id || previous.pages.length !== next.pages.length) {
    if (previous.lock || previous.pages.some((page) => page.lock)) throw new LockedLayoutError('STRUCTURE', 'Locked document structure cannot be replaced');
  }
  if (previous.lock && (!equal(ids(previous.pages), ids(next.pages)) || !equal(previous.paper, next.paper) || !equal(previous.orientation, next.orientation) || !equal(previous.fold, next.fold) || !equal(previous.theme, next.theme))) {
    throw new LockedLayoutError('STRUCTURE', 'The document structure or configuration is locked');
  }

  if (!equal(previous.lock, next.lock)) throw new LockedLayoutError('STRUCTURE', 'Document lock metadata cannot be changed');

  const previousLocations = locationMap(previous);
  const nextLocations = locationMap(next);
  if (previous.lock) {
    const oldBlocks = new Map(previous.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)).map((block) => [block.id, block]));
    const newBlocks = new Map(next.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)).map((block) => [block.id, block]));
    const sameBlockIds = equal([...oldBlocks.keys()].sort(), [...newBlocks.keys()].sort());
    if (blocked(previous.lock, 'CONTENT') && (!sameBlockIds || [...oldBlocks].some(([id, block]) => !newBlocks.has(id) || !equal(block.config, newBlocks.get(id)?.config)))) throw new LockedLayoutError('CONTENT', 'Document content is locked');
    if (blocked(previous.lock, 'STYLE') && (!equal(previous.theme, next.theme) || [...oldBlocks].some(([id, block]) => !newBlocks.has(id) || !equal(block.styleOverrides, newBlocks.get(id)?.styleOverrides)))) throw new LockedLayoutError('STYLE', 'Document style is locked');
    if (blocked(previous.lock, 'VISIBILITY') && [...oldBlocks].some(([id, block]) => !newBlocks.has(id) || block.visibility !== newBlocks.get(id)?.visibility)) throw new LockedLayoutError('VISIBILITY', 'Document visibility is locked');
    if (blocked(previous.lock, 'SIZE') && (!equal([previous.paper, previous.orientation, previous.fold], [next.paper, next.orientation, next.fold]) || [...oldBlocks].some(([id, block]) => !newBlocks.has(id) || block.width !== newBlocks.get(id)?.width))) throw new LockedLayoutError('SIZE', 'Document sizing is locked');
    if (blocked(previous.lock, 'POSITION') && (!equal([...previousLocations].sort(), [...nextLocations].sort()) || !equal(previous.pages.flatMap((page) => page.regions.map((region) => region.columns)), next.pages.flatMap((page) => page.regions.map((region) => region.columns))) || !equal([...oldBlocks].map(([id, block]) => [id, block.digitalOrder]).sort(), [...newBlocks].map(([id, block]) => [id, block.digitalOrder]).sort()))) throw new LockedLayoutError('POSITION', 'Document positions are locked');
  }
  const nextPages = new Map(next.pages.map((page) => [page.id, page]));
  previous.pages.forEach((oldPage, pageIndex) => {
    const newPage = nextPages.get(oldPage.id);
    if (!newPage) {
      if (oldPage.lock) throw new LockedLayoutError('STRUCTURE', 'A locked page cannot move or be replaced');
      return;
    }
    if (!equal(oldPage.lock, newPage.lock)) throw new LockedLayoutError('STRUCTURE', 'Page lock metadata cannot be changed');
    if (blocked(oldPage.lock, 'POSITION') && next.pages.indexOf(newPage) !== pageIndex) throw new LockedLayoutError('POSITION', 'A locked page cannot move');
    const oldPageBlocks = oldPage.regions.flatMap((region) => region.blocks);
    const newPageBlocks = newPage.regions.flatMap((region) => region.blocks);
    if (blocked(oldPage.lock, 'POSITION') && (!equal(ids(oldPageBlocks), ids(newPageBlocks)) || !equal(oldPageBlocks.map((block) => [block.id, block.digitalOrder]), newPageBlocks.map((block) => [block.id, block.digitalOrder])))) throw new LockedLayoutError('POSITION', 'Locked page block positions cannot change');
    if (blocked(oldPage.lock, 'CONTENT') && !equal(oldPageBlocks.map((block) => [block.id, block.config]), newPageBlocks.map((block) => [block.id, block.config]))) throw new LockedLayoutError('CONTENT', 'Locked page content cannot change');
    if (blocked(oldPage.lock, 'SIZE') && !equal(oldPageBlocks.map((block) => [block.id, block.width]), newPageBlocks.map((block) => [block.id, block.width]))) throw new LockedLayoutError('SIZE', 'Locked page sizing cannot change');
    if (blocked(oldPage.lock, 'STYLE') && !equal(oldPageBlocks.map((block) => [block.id, block.styleOverrides]), newPageBlocks.map((block) => [block.id, block.styleOverrides]))) throw new LockedLayoutError('STYLE', 'Locked page style cannot change');
    if (blocked(oldPage.lock, 'VISIBILITY') && !equal(oldPageBlocks.map((block) => [block.id, block.visibility]), newPageBlocks.map((block) => [block.id, block.visibility]))) throw new LockedLayoutError('VISIBILITY', 'Locked page visibility cannot change');
    if (oldPage.lock && !equal(ids(oldPage.regions), ids(newPage.regions))) throw new LockedLayoutError('STRUCTURE', 'Locked page regions cannot be added, removed, or reordered');
    const nextRegions = new Map(newPage.regions.map((region) => [region.id, region]));
    oldPage.regions.forEach((oldRegion, regionIndex) => {
      const newRegion = nextRegions.get(oldRegion.id);
      if (!newRegion) {
        if (oldRegion.lock) throw new LockedLayoutError('STRUCTURE', 'A locked region cannot move or be replaced');
        return;
      }
      if (!equal(oldRegion.lock, newRegion.lock)) throw new LockedLayoutError('STRUCTURE', 'Region lock metadata cannot be changed');
      if (blocked(oldRegion.lock, 'POSITION') && newPage.regions.indexOf(newRegion) !== regionIndex) throw new LockedLayoutError('POSITION', 'A locked region cannot move');
      if (oldRegion.lock) {
        if (blocked(oldRegion.lock, 'POSITION') && (!equal(ids(oldRegion.blocks), ids(newRegion.blocks)) || !equal(oldRegion.columns.blockIds, newRegion.columns.blockIds) || !equal(oldRegion.blocks.map((block) => [block.id, block.digitalOrder]), newRegion.blocks.map((block) => [block.id, block.digitalOrder])))) throw new LockedLayoutError('POSITION', 'Locked region block positions cannot change');
        if (blocked(oldRegion.lock, 'SIZE') && (!equal(oldRegion.columns, newRegion.columns) || oldRegion.ratio !== newRegion.ratio || oldRegion.gutter !== newRegion.gutter)) throw new LockedLayoutError('SIZE', 'Locked region size cannot change');
        if (blocked(oldRegion.lock, 'CONTENT') && !equal(oldRegion.blocks.map((block) => block.config), newRegion.blocks.map((block) => block.config))) throw new LockedLayoutError('CONTENT', 'Locked region content cannot change');
        if (blocked(oldRegion.lock, 'STYLE') && !equal(oldRegion.blocks.map((block) => ({ width: block.width, printBehavior: block.printBehavior, digitalBehavior: block.digitalBehavior, styleOverrides: block.styleOverrides })), newRegion.blocks.map((block) => ({ width: block.width, printBehavior: block.printBehavior, digitalBehavior: block.digitalBehavior, styleOverrides: block.styleOverrides })))) throw new LockedLayoutError('STYLE', 'Locked region style cannot change');
        if (blocked(oldRegion.lock, 'VISIBILITY') && !equal(oldRegion.blocks.map((block) => block.visibility), newRegion.blocks.map((block) => block.visibility))) throw new LockedLayoutError('VISIBILITY', 'Locked region visibility cannot change');
      }
    });
  });

  const previousBlocks = new Map(previous.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)).map((block) => [block.id, block]));
  const nextBlocks = new Map(next.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)).map((block) => [block.id, block]));
  for (const [id, oldBlock] of previousBlocks) {
    const newBlock = nextBlocks.get(id);
    if (!newBlock) {
      if (oldBlock.lock) throw new LockedLayoutError('STRUCTURE', 'A locked block cannot be removed');
      continue;
    }
    if (!equal(oldBlock.lock, newBlock.lock)) throw new LockedLayoutError('STRUCTURE', 'Block lock metadata cannot be changed');
    const oldLocation = previousLocations.get(id);
    const newLocation = nextLocations.get(id);
    if (blocked(oldBlock.lock, 'POSITION') && (!equal(oldLocation, newLocation) || oldBlock.digitalOrder !== newBlock.digitalOrder)) throw new LockedLayoutError('POSITION', 'A locked block cannot move');
    if (blocked(oldBlock.lock, 'CONTENT') && !equal(oldBlock.config, newBlock.config)) throw new LockedLayoutError('CONTENT', 'Block content is locked');
    if (blocked(oldBlock.lock, 'SIZE') && oldBlock.width !== newBlock.width) throw new LockedLayoutError('SIZE', 'Block size is locked');
    if (blocked(oldBlock.lock, 'STYLE') && !equal(oldBlock.styleOverrides, newBlock.styleOverrides)) throw new LockedLayoutError('STYLE', 'Block style is locked');
    if (blocked(oldBlock.lock, 'VISIBILITY') && oldBlock.visibility !== newBlock.visibility) throw new LockedLayoutError('VISIBILITY', 'Block visibility is locked');
  }
}
