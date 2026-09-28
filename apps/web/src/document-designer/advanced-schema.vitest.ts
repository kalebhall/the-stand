import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { normalizeToAdvanced, parseAdvancedLayout } from './advanced-schema';

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
      pages: [{
        ...legacy.pages[0],
        regions: [{
          ...sourceRegion,
          columns: {
            count: 1,
            ratio: '1/1',
            gutter: sourceRegion.gutter,
            blockIds: [sourceRegion.blocks.map((block) => block.id)]
          }
        }]
      }]
    };

    const parsed = parseAdvancedLayout(persisted);

    expect(parsed).toEqual(normalizeToAdvanced(legacy));
    expect(parsed.pages[0].regions).toHaveLength(4);
    expect(() => parseAdvancedLayout(parsed)).not.toThrow();
  });
});
