import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCUMENT_LAYOUT } from './schema';
import { parseAdvancedLayout, downgradeToV1, normalizeToAdvanced, projectAdvancedLayoutForOutput } from './advanced-schema';
import { addBlock, configureColumns, createBlankAdvancedLayout, moveBlockToColumn, removeBlock, resizeBlock } from './layout-operations';
import { validateAdvancedLayout, snapColumn, snapWidth } from './advanced-validation';
import { createHistory, commitHistory, redo, undo } from './history';
import { assertNoLockedChanges, LockedLayoutError } from './lock-enforcement';
import type { DocumentBlock } from './types';

const secondBlock: DocumentBlock = {
  id: '00000000-0000-4000-8000-000000000005' as DocumentBlock['id'],
  type: 'CUSTOM_TEXT', width: 'FULL', dataMode: 'MANUAL', visibility: 'VISIBLE', printBehavior: 'PRINT_AND_DIGITAL', digitalBehavior: 'NORMAL', config: { text: 'Second' }
};

describe('advanced document designer', () => {
  it('upgrades v1 without changing identities or order and can downgrade', () => {
    const upgraded = normalizeToAdvanced(DEFAULT_DOCUMENT_LAYOUT);
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.pages[0].regions[0].blocks[0].id).toBe(DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0].blocks[0].id);
    expect(downgradeToV1(upgraded).pages[0].regions[0].blocks[0].id).toBe(DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0].blocks[0].id);
  });

  it('maps a legacy bifold into four stable panel regions', () => {
    const bifold = { ...DEFAULT_DOCUMENT_LAYOUT, fold: 'BIFOLD' as const };
    const upgraded = normalizeToAdvanced(bifold);
    expect(upgraded.pages[0].regions).toHaveLength(4);
    expect(upgraded.pages[0].regions.map((region) => region.ratio)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(new Set(upgraded.pages[0].regions.map((region) => region.id)).size).toBe(4);
    expect(upgraded.pages[0].regions.flatMap((region) => region.blocks).map((block) => block.id).sort()).toEqual(
      DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0].blocks.map((block) => block.id).sort()
    );
  });
  it('preserves v2 columns and advanced block metadata through a round trip', () => {
    const source = structuredClone(DEFAULT_DOCUMENT_LAYOUT) as unknown as Record<string, unknown>;
    const page = (source.pages as Array<Record<string, unknown>>)[0];
    const region = (page.regions as Array<Record<string, unknown>>)[0];
    source.schemaVersion = 2;
    region.columns = { count: 1, ratio: '1/1', gutter: 9, blockIds: [[DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0].blocks[0].id]] };
    region.gutter = 9;
    const block = (region.blocks as Array<Record<string, unknown>>)[0];
    block.styleOverrides = { fontFamily: 'SERIF', fontSize: 18 };
    block.visibilityRule = 'WHEN_PUBLIC';
    block.digitalOrder = 4;
    const parsed = parseAdvancedLayout(source);
    expect(parsed.pages[0].regions[0].columns.gutter).toBe(9);
    expect(parsed.pages[0].regions[0].blocks[0].styleOverrides?.fontFamily).toBe('SERIF');
    expect(parsed.pages[0].regions[0].blocks[0].digitalOrder).toBe(4);
  });
  it('uses resolved data for conditional visibility and preserves print document order', () => {
    const base = parseAdvancedLayout(DEFAULT_DOCUMENT_LAYOUT);
    const withSecond = addBlock(base, 0, 0, { ...secondBlock, digitalOrder: 0 } as DocumentBlock);
    withSecond.pages[0].regions[0].blocks[0].visibilityRule = 'WHEN_DATA_EXISTS';
    withSecond.pages[0].regions[0].blocks[0].digitalOrder = 9;
    const emptyData = {
      meetingDate: '2026-09-20', meetingType: 'SACRAMENT', values: { [withSecond.pages[0].regions[0].blocks[0].type]: null },
      meetingItems: [], warnings: []
    };
    const digital = projectAdvancedLayoutForOutput(withSecond, 'DIGITAL', emptyData);
    expect(digital.pages[0].regions[0].blocks).toHaveLength(1);
    expect(digital.pages[0].regions[0].blocks[0].id).toBe(secondBlock.id);
    const print = projectAdvancedLayoutForOutput(withSecond, 'PRINT', { ...emptyData, values: { [withSecond.pages[0].regions[0].blocks[0].type]: 'resolved' } });
    expect(print.pages[0].regions[0].blocks.map((block) => block.id)).toEqual([
      withSecond.pages[0].regions[0].blocks[0].id,
      secondBlock.id
    ]);
  });

  it('adds, moves, resizes, removes, and configures columns', () => {
    const base = parseAdvancedLayout(DEFAULT_DOCUMENT_LAYOUT);
    const added = addBlock(base, 0, 0, secondBlock);
    const two = configureColumns(added, 0, 0, 2, '1/3+2/3', 12);
    const moved = moveBlockToColumn(two, secondBlock.id, 0, 0, 1);
    expect(moved.pages[0].regions[0].columns.blockIds[1]).toContain(secondBlock.id);
    expect(resizeBlock(moved, secondBlock.id, 'HALF').pages[0].regions[0].blocks[1].width).toBe('HALF');
    expect(removeBlock(moved, secondBlock.id).pages[0].regions[0].blocks).toHaveLength(1);
  });

  it('validates supported widths and snapping', () => {
    const result = validateAdvancedLayout(parseAdvancedLayout(DEFAULT_DOCUMENT_LAYOUT));
    expect(result.issues.filter((issue) => issue.severity === 'ERROR')).toHaveLength(0);
    expect(snapWidth(0.9)).toBe('FULL');
    expect(snapWidth(0.5)).toBe('HALF');
    expect(snapColumn(0.8, 2)).toBe(1);
  });

  it('tracks coherent undo and redo history and invalidates redo after a new edit', () => {
    const initial = createBlankAdvancedLayout();
    const changed = configureColumns(initial, 0, 0, 2, '1/1', 8);
    const state = commitHistory(createHistory(initial), changed);
    expect(undo(state).present.pages[0].regions[0].columns.count).toBe(1);
    const undone = undo(state);
    const changedAgain = configureColumns(undone.present, 0, 0, 3, '1/1', 4);
    expect(redo(commitHistory(undone, changedAgain)).present.pages[0].regions[0].columns.count).toBe(3);
  });

  it('rejects locked position and page-structure changes', () => {
    const base = parseAdvancedLayout(DEFAULT_DOCUMENT_LAYOUT);
    const withSecond = addBlock(base, 0, 0, secondBlock);
    const locked = structuredClone(withSecond);
    locked.pages[0].lock = { level: 'REGION', properties: ['POSITION'] };
    locked.pages[0].regions[0].blocks[0].lock = { level: 'BLOCK', properties: ['POSITION'] };
    const moved = structuredClone(locked);
    [moved.pages[0].regions[0].blocks[0], moved.pages[0].regions[0].blocks[1]] = [moved.pages[0].regions[0].blocks[1], moved.pages[0].regions[0].blocks[0]];
    [moved.pages[0].regions[0].columns.blockIds[0][0], moved.pages[0].regions[0].columns.blockIds[0][1]] = [moved.pages[0].regions[0].columns.blockIds[0][1], moved.pages[0].regions[0].columns.blockIds[0][0]];
    expect(() => assertNoLockedChanges(locked, moved)).toThrow(LockedLayoutError);
    const removedRegion = structuredClone(locked);
    removedRegion.pages[0].regions = [];
    expect(() => assertNoLockedChanges(locked, removedRegion)).toThrow(LockedLayoutError);
  });
  it('rejects invalid advanced visibility rules and document-locked content', () => {
    const invalid = structuredClone(DEFAULT_DOCUMENT_LAYOUT) as unknown as Record<string, unknown>;
    invalid.schemaVersion = 2;
    const invalidPage = (invalid.pages as Array<Record<string, unknown>>)[0];
    const invalidRegion = (invalidPage.regions as Array<Record<string, unknown>>)[0];
    (invalidRegion.blocks as Array<Record<string, unknown>>)[0].visibilityRule = 'FORGED';
    expect(() => parseAdvancedLayout(invalid)).toThrow();
    const locked = parseAdvancedLayout({ ...DEFAULT_DOCUMENT_LAYOUT, lock: { level: 'CONFIGURATION', properties: ['CONTENT'] } });
    const changed = structuredClone(locked);
    changed.pages[0].regions[0].blocks[0].config = { text: 'forged' };
    expect(() => assertNoLockedChanges(locked, changed)).toThrow(LockedLayoutError);
  });
  it('rejects digital-order changes under position locks', () => {
    const locked = parseAdvancedLayout({ ...DEFAULT_DOCUMENT_LAYOUT, pages: [{ ...DEFAULT_DOCUMENT_LAYOUT.pages[0], lock: { level: 'REGION', properties: ['POSITION'] } }] });
    const changed = structuredClone(locked);
    changed.pages[0].regions[0].blocks[0].digitalOrder = 99;
    expect(() => assertNoLockedChanges(locked, changed)).toThrow(LockedLayoutError);
  });

  it('enforces locked content on the server boundary', () => {
    const locked = parseAdvancedLayout({ ...DEFAULT_DOCUMENT_LAYOUT, pages: [{ ...DEFAULT_DOCUMENT_LAYOUT.pages[0], regions: [{ ...DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0], blocks: [{ ...DEFAULT_DOCUMENT_LAYOUT.pages[0].regions[0].blocks[0], lock: { level: 'BLOCK', properties: ['CONTENT'] } }] }] }] });
    const changed = structuredClone(locked);
    changed.pages[0].regions[0].blocks[0].config = { text: 'forged' };
    expect(() => assertNoLockedChanges(locked, changed)).toThrow(LockedLayoutError);
  });
});
