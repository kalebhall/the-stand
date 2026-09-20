import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';
import { hasDraftChanged, moveBlock, setBlockVisibility, setTheme } from './designer-state';

const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });

describe('designer state', () => {
  it('reorders blocks without changing their IDs', () => {
    const first = layout.pages[0].regions[0].blocks[0];
    const second = layout.pages[0].regions[0].blocks[1];
    const next = moveBlock(layout, second.id, -1);
    expect(next.pages[0].regions[0].blocks[0].id).toBe(second.id);
    expect(next.pages[0].regions[0].blocks[1].id).toBe(first.id);
  });

  it('updates visibility and theme as immutable state transitions', () => {
    const block = layout.pages[0].regions[0].blocks[0];
    const next = setTheme(setBlockVisibility(layout, block.id, 'HIDDEN'), { baseFontSize: 14 });
    expect(next.pages[0].regions[0].blocks[0].visibility).toBe('HIDDEN');
    expect(next.theme.baseFontSize).toBe(14);
    expect(layout.pages[0].regions[0].blocks[0].visibility).toBe('VISIBLE');
  });

  it('detects changes without treating initial load as a draft', () => {
    expect(hasDraftChanged(null, layout)).toBe(false);
    expect(hasDraftChanged(layout, layout)).toBe(false);
    expect(hasDraftChanged(layout, setTheme(layout, { baseFontSize: 14 }))).toBe(true);
  });
});
