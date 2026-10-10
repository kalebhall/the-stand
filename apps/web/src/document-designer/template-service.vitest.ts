import { describe, expect, it } from 'vitest';

import { advancedBlocksChanged, containsAdvancedBlocks, containsAdvancedLayoutStructure } from './template-service';
import { normalizeToAdvanced, mergeSimpleIntoAdvanced } from './advanced-schema';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import type { DocumentBlock } from './types';

const baseLayout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const withAdvancedBlock = {
  ...baseLayout,
  pages: baseLayout.pages.map((page, pageIndex) => pageIndex === 0 ? {
    ...page,
    regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? {
      ...region,
      blocks: region.blocks.map((block, blockIndex) => blockIndex === 0 ? {
        ...block,
        type: 'PRESIDING_CONDUCTING',
        dataMode: 'AUTO',
        config: { text: 'Presiding and conducting' }
      } : block)
    } : region)
  } : page)
};

describe('advancedBlocksChanged', () => {
  it('allows ordinary edits while preserving advanced blocks', () => {
    const next = { ...withAdvancedBlock, theme: { ...withAdvancedBlock.theme, baseFontSize: 14 } };
    expect(advancedBlocksChanged(withAdvancedBlock, next)).toBe(false);
  });

  it('allows a new Simple reusable block without treating it as Advanced structure', () => {
    const block = baseLayout.pages[0].regions[0].blocks[0];
    const next = structuredClone(baseLayout);
    next.pages[0].regions[0].blocks.push({
      ...block,
      id: '00000000-0000-4000-8000-000000000099' as DocumentBlock['id'],
      reusableBlockId: '00000000-0000-4000-8000-000000000098',
      reusableBlockVersion: 2
    });
    expect(advancedBlocksChanged(baseLayout, next, { allowSimpleReusableReferences: true, allowSimpleReusableAdditions: true })).toBe(false);
  });
  it('rejects region geometry changes even when the document contains only SIMPLE blocks', () => {
    const next = {
      ...baseLayout,
      pages: baseLayout.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? { ...region, gutter: region.gutter + 1 } : region)
      } : page)
    };
    expect(advancedBlocksChanged(baseLayout, next)).toBe(true);
  });

  it('rejects column metadata changes even when the document contains only SIMPLE blocks', () => {
    const advancedBase = normalizeToAdvanced(baseLayout);
    const region = advancedBase.pages[0].regions[0];
    const next = {
      ...advancedBase,
      pages: advancedBase.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((candidate, regionIndex) => regionIndex === 0 ? {
          ...candidate,
          columns: { count: 2, ratio: '1/1', gutter: region.gutter, blockIds: [[], region.blocks.map((block) => block.id)] }
        } : candidate)
      } : page)
    };
    expect(advancedBlocksChanged(advancedBase, next)).toBe(true);
  });

  it('allows same-column reordering of SIMPLE blocks while preserving column membership', () => {
    const advancedBase = normalizeToAdvanced(baseLayout);
    const simpleBlocks = advancedBase.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)).filter((block) => ['DOCUMENT_TITLE', 'WARD_NAME', 'BUILDING_INFO', 'SERVICE_TIMES'].includes(block.type)).slice(0, 2);
    if (simpleBlocks.length < 2) return;
    const simpleOnly = {
      ...advancedBase,
      pages: advancedBase.pages.map((page, pageIndex) => ({
        ...page,
        regions: page.regions.map((region, regionIndex) => {
          const blocks = pageIndex === 0 && regionIndex === 0 ? simpleBlocks : [];
          return { ...region, blocks, columns: { count: 1, ratio: '1/1' as const, gutter: region.gutter, blockIds: [blocks.map((block) => block.id)] } };
        })
      }))
    };
    const reordered = {
      ...simpleOnly,
      pages: simpleOnly.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((candidate, regionIndex) => regionIndex === 0 ? { ...candidate, blocks: [...candidate.blocks.slice(1), candidate.blocks[0]] } : candidate)
      } : page)
    };
    expect(advancedBlocksChanged(simpleOnly, reordered)).toBe(false);
  });

  it('rejects Advanced-only metadata on a SIMPLE block', () => {
    const advancedBase = normalizeToAdvanced(baseLayout);
    const simpleWithMetadata = {
      ...advancedBase,
      pages: advancedBase.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? {
          ...region,
          blocks: region.blocks.map((block, blockIndex) => blockIndex === 0 ? { ...block, type: 'DOCUMENT_TITLE', styleOverrides: { fontSize: 18 } } : block)
        } : region)
      } : page)
    };
    expect(advancedBlocksChanged(advancedBase, simpleWithMetadata)).toBe(true);
    expect(containsAdvancedBlocks(simpleWithMetadata)).toBe(true);
    expect(containsAdvancedLayoutStructure(advancedBase)).toBe(true);
    expect(containsAdvancedLayoutStructure(baseLayout)).toBe(false);
  });

  it('rejects metadata, lock, type, and placement mutations for SIMPLE blocks', () => {
    const advancedBase = normalizeToAdvanced(baseLayout);
    const firstPage = advancedBase.pages[0];
    const firstRegion = firstPage.regions[0];
    const firstBlock = firstRegion.blocks[0];
    expect(advancedBlocksChanged(baseLayout, { ...baseLayout, metadata: { documentTitleSource: 'AUTHORED' } })).toBe(true);
    expect(advancedBlocksChanged(advancedBase, { ...advancedBase, lock: { level: 'REGION', properties: ['POSITION'] } })).toBe(true);
    expect(advancedBlocksChanged(advancedBase, { ...advancedBase, pages: [{ ...firstPage, lock: { level: 'REGION', properties: ['POSITION'] } }] })).toBe(true);
    expect(advancedBlocksChanged(advancedBase, { ...advancedBase, pages: [{ ...firstPage, regions: [{ ...firstRegion, blocks: firstRegion.blocks.map((block) => block.id === firstBlock.id ? { ...firstBlock, type: 'WARD_NAME', dataMode: 'AUTO' } : block) }] }] })).toBe(true);
    expect(advancedBlocksChanged(advancedBase, { ...advancedBase, pages: [{ ...firstPage, regions: [{ ...firstRegion, blocks: firstRegion.blocks.map((block) => block.id === firstBlock.id ? { ...firstBlock, lock: { level: 'REGION', properties: ['POSITION'] } } : block) }] }] })).toBe(true);
  });

  it('merges Simple v1 saves into an existing v2 layout without downgrading or dropping metadata', () => {
    const advancedBase = normalizeToAdvanced(baseLayout);
    const firstRegion = advancedBase.pages[0].regions[0];
    const firstBlock = firstRegion.blocks[0];
    const withMetadata = {
      ...advancedBase,
      pages: advancedBase.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? {
          ...region,
          blocks: region.blocks.map((block, blockIndex) => blockIndex === 0 ? {
            ...block,
            type: 'CUSTOM_TEXT' as const,
            config: { text: 'Source-driven' },
            styleOverrides: { fontSize: 18 },
            source: { key: 'WARD_NAME', fallbackText: 'Ward' },
            reusableBlockId: '00000000-0000-4000-8000-000000000099',
            reusableBlockVersion: 3
          } : block)
        } : region)
      } : page)
    } as typeof advancedBase;
    const simpleEdit = {
      ...baseLayout,
      pages: baseLayout.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? {
          ...region,
          blocks: region.blocks.map((block, blockIndex) => blockIndex === 0 ? { ...block, type: 'CUSTOM_TEXT' as const, config: { text: 'Source-driven' } } : block)
        } : region)
      } : page)
    };
    const merged = mergeSimpleIntoAdvanced(withMetadata, simpleEdit);
    expect(merged.schemaVersion).toBe(2);
    expect(merged.pages[0].regions[0].blocks.find((block) => block.id === firstBlock.id)?.styleOverrides).toEqual({ fontSize: 18 });
    expect(merged.pages[0].regions[0].blocks.find((block) => block.id === firstBlock.id)?.source).toEqual({ key: 'WARD_NAME', fallbackText: 'Ward' });
    expect(merged.pages[0].regions[0].blocks.find((block) => block.id === firstBlock.id)?.reusableBlockVersion).toBe(3);
    expect(advancedBlocksChanged(withMetadata, merged)).toBe(false);
    const structuralSimpleEdit = {
      ...simpleEdit,
      pages: simpleEdit.pages.map((page, pageIndex) => pageIndex === 0 ? { ...page, id: '00000000-0000-4000-8000-000000000099' as typeof page.id } : page)
    } as typeof baseLayout;
    const structurallyMerged = mergeSimpleIntoAdvanced(withMetadata, structuralSimpleEdit);
    expect(structurallyMerged.pages[0].regions[0].blocks.find((block) => block.id === firstBlock.id)?.source).toEqual({ key: 'WARD_NAME', fallbackText: 'Ward' });
    expect(structurallyMerged.pages[0].regions[0].blocks.find((block) => block.id === firstBlock.id)?.reusableBlockVersion).toBe(3);
  });

  it('rejects page/region order and document geometry changes', () => {
    const advancedBase = normalizeToAdvanced(adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' }));
    const pageRegionReordered = {
      ...advancedBase,
      pages: advancedBase.pages.map((page) => ({ ...page, regions: [...page.regions].reverse() }))
    };
    expect(advancedBlocksChanged(advancedBase, pageRegionReordered)).toBe(true);
    expect(advancedBlocksChanged(advancedBase, { ...advancedBase, paper: advancedBase.paper === 'LETTER' ? 'A4' : 'LETTER' })).toBe(true);
    expect(advancedBlocksChanged(advancedBase, { ...advancedBase, orientation: advancedBase.orientation === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT' })).toBe(true);
  });

  it('detects advanced content and placement mutations', () => {
    const changedContent = {
      ...withAdvancedBlock,
      pages: withAdvancedBlock.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? {
          ...region,
          blocks: region.blocks.map((block, blockIndex) => blockIndex === 0 ? { ...block, config: { text: 'Changed' } } : block)
        } : region)
      } : page)
    };
    expect(advancedBlocksChanged(withAdvancedBlock, changedContent)).toBe(true);

    const changedRegion = {
      ...withAdvancedBlock,
      pages: withAdvancedBlock.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? { ...region, gutter: region.gutter + 1 } : region)
      } : page)
    };
    expect(advancedBlocksChanged(withAdvancedBlock, changedRegion)).toBe(true);

    const reordered = {
      ...withAdvancedBlock,
      pages: withAdvancedBlock.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? { ...region, blocks: [...region.blocks.slice(1), region.blocks[0]] } : region)
      } : page)
    };
    expect(advancedBlocksChanged(withAdvancedBlock, reordered)).toBe(true);

    const removed = {
      ...withAdvancedBlock,
      pages: withAdvancedBlock.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        regions: page.regions.map((region, regionIndex) => regionIndex === 0 ? { ...region, blocks: region.blocks.slice(1) } : region)
      } : page)
    };
    expect(advancedBlocksChanged(withAdvancedBlock, removed)).toBe(true);
  });
});
