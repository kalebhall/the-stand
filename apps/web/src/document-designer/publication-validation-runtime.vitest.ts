import { describe, expect, it, vi } from 'vitest';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import type { ResolvedDocumentData } from './render-types';

vi.mock('sharp', () => {
  throw new Error('Publication validation must not load the image-processing runtime.');
});

const data: ResolvedDocumentData = {
  meetingDate: '2026-01-01',
  meetingType: 'SACRAMENT',
  wardName: 'Ward',
  meetingItems: [],
  values: {},
  warnings: [],
  media: {
    '00000000-0000-0000-0000-000000000000': {
      url: '/media/public-image',
      altText: 'Meetinghouse exterior',
      isDecorative: false
    }
  }
};

describe('publication validation runtime boundary', () => {
  it('validates published image metadata without loading sharp', async () => {
    const { validatePublication } = await import('./publication-validation');
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const region = layout.pages[0].regions[0];
    const image = {
      ...region.blocks[0],
      type: 'IMAGE',
      config: { assetId: '00000000-0000-0000-0000-000000000000', alt: '', isDecorative: false }
    } as never;
    const imageLayout = {
      ...layout,
      pages: [{ ...layout.pages[0], regions: [{ ...region, blocks: [image] }] }]
    };

    const result = validatePublication({ layout: imageLayout, data }, { explicitPublicBlockTypes: ['IMAGE'] });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
