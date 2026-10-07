import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import {
  downgradeToV1,
  normalizeToAdvanced,
  parseAdvancedLayout,
  mergeSimpleIntoAdvanced,
  projectAdvancedLayoutForOutput
} from './advanced-schema';

describe('advanced document layout normalization', () => {
  it('repairs bifold columns persisted before panel splitting', () => {
    const legacy = adaptLegacyLayoutToDocument({
      preset: 'SINGLE_SHEET_BIFOLD',
      announcementMode: 'AFTER_PROGRAM',
      coverMode: 'NONE'
    });
    const sourceRegion = legacy.pages[0].regions[0];
    const persisted = {
      ...legacy,
      schemaVersion: 2,
      pages: [
        {
          ...legacy.pages[0],
          regions: [
            {
              ...sourceRegion,
              columns: {
                count: 1,
                ratio: '1/1',
                gutter: sourceRegion.gutter,
                blockIds: [sourceRegion.blocks.map((block) => block.id)]
              }
            }
          ]
        }
      ]
    };

    const parsed = parseAdvancedLayout(persisted);

    expect(parsed).toEqual(normalizeToAdvanced(legacy));
    expect(parsed.pages[0].regions).toHaveLength(4);
    expect(() => parseAdvancedLayout(parsed)).not.toThrow();
  });

  it('splits every single-region logical page in a multi-page bifold layout', () => {
    const legacy = adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const sourceRegion = legacy.pages[0].regions[0];
    const firstPageBlocks = sourceRegion.blocks.map((block) =>
      block.type === 'MEETING_PROGRAM'
        ? { ...block, styleOverrides: { fontSize: 18 }, visibilityRule: 'WHEN_PUBLIC' as const, digitalOrder: 9 }
        : block
    );
    const secondPageBlocks = sourceRegion.blocks.map((block, index) => ({
      ...block,
      id: `44444444-4444-4444-8444-4444444444${String(index).padStart(2, '0')}`
    }));
    const persisted = {
      ...legacy,
      schemaVersion: 2,
      pages: [
        {
          ...legacy.pages[0],
          regions: [
            {
              ...sourceRegion,
              blocks: firstPageBlocks,
              columns: { count: 1, ratio: '1/1', gutter: sourceRegion.gutter, blockIds: [firstPageBlocks.map((block) => block.id)] }
            }
          ]
        },
        {
          ...legacy.pages[0],
          id: '66666666-6666-4666-8666-666666666666',
          regions: [
            {
              ...sourceRegion,
              id: '33333333-3333-4333-8333-333333333333',
              blocks: secondPageBlocks,
              columns: { count: 1, ratio: '1/1', gutter: sourceRegion.gutter, blockIds: [secondPageBlocks.map((block) => block.id)] }
            }
          ]
        }
      ]
    };
    const parsed = parseAdvancedLayout(persisted);
    expect(parsed.pages.map((page) => page.regions.length)).toEqual([4, 4]);
    const parsedProgram = parsed.pages[0].regions.flatMap((region) => region.blocks).find((block) => block.type === 'MEETING_PROGRAM');
    expect(parsedProgram).toMatchObject({ styleOverrides: { fontSize: 18 }, visibilityRule: 'WHEN_PUBLIC', digitalOrder: 9 });
  });

  it('rejects malformed schema-v2 column assignments instead of silently repairing them', () => {
    const advanced = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const region = advanced.pages[0].regions[0];
    const malformed = structuredClone(advanced);
    malformed.pages[0].regions[0].columns = { ...region.columns, blockIds: [[region.blocks[0].id]] };

    expect(() => parseAdvancedLayout(malformed)).toThrow(/columns do not match|Column block assignments/);
  });

  it.each([
    ['TRIFOLD', 6],
    ['HALF_SHEET', 4]
  ] as const)('normalizes %s single-region layouts into explicit physical panels', (fold, expectedRegions) => {
    const source =
      fold === 'TRIFOLD'
        ? adaptLegacyLayoutToDocument({ preset: 'TRI_FOLD_BULLETIN', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
        : {
            ...adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' }),
            fold: 'HALF_SHEET' as const
          };
    const parsed = parseAdvancedLayout({ ...source, schemaVersion: 2 });
    expect(parsed.pages[0].regions).toHaveLength(expectedRegions);
    expect(parsed.pages[0].regions.flatMap((region) => region.blocks)).toHaveLength(source.pages[0].regions[0].blocks.length);
    expect(() => parseAdvancedLayout(parsed)).not.toThrow();
  });

  it('preserves simple-mode region geometry when merging back into advanced layout', () => {
    const advanced = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const firstRegion = advanced.pages[0].regions[0];
    advanced.pages[0].regions = [
      { ...firstRegion, ratio: 0.5 },
      {
        ...firstRegion,
        id: '55555555-5555-4555-8555-555555555555' as typeof firstRegion.id,
        ratio: 0.5,
        blocks: [],
        columns: { ...firstRegion.columns, blockIds: [[]] }
      }
    ];
    const simple = downgradeToV1(advanced);
    simple.pages[0].regions[0].ratio = 0.7;
    simple.pages[0].regions[0].gutter = 12;
    simple.pages[0].regions[1].ratio = 0.3;
    const merged = mergeSimpleIntoAdvanced(advanced, simple);
    expect(merged.pages[0].regions[0].ratio).toBe(0.7);
    expect(merged.pages[0].regions[0].gutter).toBe(12);
    expect(merged.pages[0].regions[0].columns.gutter).toBe(12);
  });

  it('reconciles simple-mode block order into advanced columns', () => {
    const advanced = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const simple = downgradeToV1(advanced);
    const blocks = simple.pages[0].regions[0].blocks;
    simple.pages[0].regions[0].blocks = [blocks[1], blocks[0], ...blocks.slice(2)];
    const merged = mergeSimpleIntoAdvanced(advanced, simple);
    expect(merged.pages[0].regions[0].blocks.map((block) => block.id)).toEqual(simple.pages[0].regions[0].blocks.map((block) => block.id));
    expect(merged.pages[0].regions[0].columns.blockIds.flat()).toEqual(simple.pages[0].regions[0].blocks.map((block) => block.id));
  });

  it('rebuilds projected column assignments after visibility filtering', () => {
    const advanced = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const region = advanced.pages[0].regions[0];
    const hidden = region.blocks[1];
    hidden.visibility = 'HIDDEN';
    region.columns = {
      count: 2,
      ratio: '1/1',
      gutter: region.gutter,
      blockIds: [[region.blocks[0].id], region.blocks.slice(1).map((block) => block.id)]
    };
    const projected = projectAdvancedLayoutForOutput(advanced, 'PRINT');
    expect(() => parseAdvancedLayout(projected)).not.toThrow();
    expect(projected.pages[0].regions[0].columns.blockIds.flat()).not.toContain(hidden.id);
    expect(projected.pages[0].regions[0].columns.blockIds.flat()).toHaveLength(region.blocks.length - 1);
  });
});
