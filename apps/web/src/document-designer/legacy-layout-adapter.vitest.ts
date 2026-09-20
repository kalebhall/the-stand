import { describe, expect, it } from 'vitest';

import { adaptDocumentToLegacyLayout, adaptLegacyLayoutToDocument } from './legacy-layout-adapter';

describe('legacy layout adapter', () => {
  it.each([
    ['SINGLE_SHEET_BIFOLD', 'BIFOLD'],
    ['TRI_FOLD_BULLETIN', 'TRIFOLD'],
    ['FULL_PAGE', 'NONE']
  ] as const)('maps %s to a validated document fold', (preset, fold) => {
    const layout = adaptLegacyLayoutToDocument({ preset, announcementMode: 'BACK_PANEL', coverMode: 'AUTHORIZED_IMAGE', coverImageUrl: 'https://example.test/image.png', coverImageAltText: 'Ward' });
    expect(layout.fold).toBe(fold);
    expect(adaptDocumentToLegacyLayout(layout)).toMatchObject({ preset, announcementMode: 'BACK_PANEL', coverMode: 'AUTHORIZED_IMAGE' });
    expect(layout.metadata).toMatchObject({ coverImageUrl: 'https://example.test/image.png', coverImageAltText: 'Ward' });
  });

  it('does not mutate the legacy input', () => {
    const legacy = { preset: 'FULL_PAGE' as const, announcementMode: 'NONE' as const, coverMode: 'NONE' as const };
    const original = { ...legacy };
    adaptLegacyLayoutToDocument(legacy);
    expect(legacy).toEqual(original);
  });
});
