import { parseDocumentLayout } from './schema';
import { allBlocks } from './public-safety';
import { getRegisteredBlockDefinition } from './registry';
import type { DocumentBlock, DocumentLayout } from './types';

export type SimpleModeProperties = {
  blockTypes: readonly string[];
  editableBlockProperties: readonly string[];
  editableThemeProperties: readonly string[];
  advancedModeAvailable: boolean;
};

export class SimpleModeValidationError extends Error {
  constructor(public readonly code: 'INVALID_LAYOUT' | 'STRUCTURE_LOCKED' | 'PROPERTY_LOCKED' | 'ADVANCED_BLOCK', message: string) {
    super(message);
    this.name = 'SimpleModeValidationError';
  }
}

const json = (value: unknown) => JSON.stringify(value);
const hasLock = (lock: DocumentBlock['lock'] | DocumentLayout['lock'], property: string) => Boolean(lock?.properties.includes(property as never));

function blockIndex(layout: DocumentLayout, id: string): [number, number, number] | null {
  for (const [pageIndex, page] of layout.pages.entries()) {
    for (const [regionIndex, region] of page.regions.entries()) {
      const index = region.blocks.findIndex((block) => block.id === id);
      if (index >= 0) return [pageIndex, regionIndex, index];
    }
  }
  return null;
}

function samePageAndRegionStructure(current: DocumentLayout, next: DocumentLayout): boolean {
  return current.pages.length === next.pages.length && current.pages.every((page, pageIndex) => {
    const otherPage = next.pages[pageIndex];
    return page.id === otherPage.id && page.regions.length === otherPage.regions.length && page.regions.every((region, regionIndex) => {
      const otherRegion = otherPage.regions[regionIndex];
      return region.id === otherRegion.id && region.blocks.length === otherRegion.blocks.length;
    });
  });
}

export function getSimpleModeProperties(layout: DocumentLayout, advancedModeAvailable = false): SimpleModeProperties {
  return {
    blockTypes: [...new Set(allBlocks(layout).filter((block) => getRegisteredBlockDefinition(layout.documentType, block.type).exposure === 'SIMPLE').map((block) => block.type))],
    editableBlockProperties: ['VISIBILITY', 'CONTENT', 'POSITION'],
    editableThemeProperties: ['fontFamily', 'baseFontSize', 'accentColor'],
    advancedModeAvailable
  };
}

export function validateSimpleModeDraft(input: unknown, currentInput: unknown): { layout: DocumentLayout; warnings: string[] } {
  let current: DocumentLayout;
  let layout: DocumentLayout;
  try {
    current = parseDocumentLayout(currentInput);
    layout = parseDocumentLayout(input);
  } catch (error) {
    throw new SimpleModeValidationError('INVALID_LAYOUT', error instanceof Error ? error.message : 'Invalid document layout');
  }
  if (layout.documentType !== current.documentType || !samePageAndRegionStructure(current, layout)) {
    throw new SimpleModeValidationError('STRUCTURE_LOCKED', 'Simple Mode cannot change document structure');
  }
  if (layout.id !== current.id || layout.pages.some((page, pageIndex) => page.id !== current.pages[pageIndex].id)) {
    throw new SimpleModeValidationError('STRUCTURE_LOCKED', 'Document and page identities are locked');
  }
  if (hasLock(current.lock, 'STYLE') && json(layout.theme) !== json(current.theme)) {
    throw new SimpleModeValidationError('PROPERTY_LOCKED', 'The document theme is locked');
  }
  const currentBlocks = new Map(allBlocks(current).map((block) => [block.id, block]));
  for (const nextBlock of allBlocks(layout)) {
    const previous = currentBlocks.get(nextBlock.id);
    if (!previous || previous.type !== nextBlock.type) throw new SimpleModeValidationError('STRUCTURE_LOCKED', 'Block identities and types are locked');
    const definition = getRegisteredBlockDefinition(layout.documentType, nextBlock.type);
    if (definition.exposure === 'ADVANCED' && json(previous) !== json(nextBlock)) {
      throw new SimpleModeValidationError('ADVANCED_BLOCK', `${nextBlock.type} is managed by Advanced Mode`);
    }
    if (hasLock(previous.lock, 'CONTENT') && json(previous.config) !== json(nextBlock.config)) {
      throw new SimpleModeValidationError('PROPERTY_LOCKED', `${nextBlock.type} content is locked`);
    }
    if (hasLock(previous.lock, 'VISIBILITY') && previous.visibility !== nextBlock.visibility) {
      throw new SimpleModeValidationError('PROPERTY_LOCKED', `${nextBlock.type} visibility is locked`);
    }
    if (hasLock(previous.lock, 'STYLE') && json({ width: previous.width, printBehavior: previous.printBehavior, digitalBehavior: previous.digitalBehavior }) !== json({ width: nextBlock.width, printBehavior: nextBlock.printBehavior, digitalBehavior: nextBlock.digitalBehavior })) {
      throw new SimpleModeValidationError('PROPERTY_LOCKED', `${nextBlock.type} style is locked`);
    }
    if (hasLock(previous.lock, 'POSITION') && JSON.stringify(blockIndex(current, previous.id)) !== JSON.stringify(blockIndex(layout, nextBlock.id))) {
      throw new SimpleModeValidationError('PROPERTY_LOCKED', `${nextBlock.type} position is locked`);
    }
  }
  return { layout, warnings: [] };
}

export function buildPublicPreviewSource(meeting: { meetingDate: string; meetingType: string; wardName?: string | null }, programItems: Array<{ itemType: string; title?: string | null; topic?: string | null; hymnTitle?: string | null; sequence: number }>) {
  return {
    meetingDate: meeting.meetingDate,
    meetingType: meeting.meetingType,
    wardName: meeting.wardName ?? null,
    programItems: programItems.map((item) => ({
      order: item.sequence,
      label: item.title || item.hymnTitle || item.itemType.replaceAll('_', ' '),
      details: item.topic || null
    }))
  };
}
