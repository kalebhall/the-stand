import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { PublicSafetyError, validatePublicDocumentLayout } from './public-safety';

describe('public document safety', () => {
  it('rejects internal blocks and requires explicit public block approval', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    expect(() => validatePublicDocumentLayout(layout)).toThrow(/explicit public approval/);
    expect(() =>
      validatePublicDocumentLayout(layout, ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE'])
    ).not.toThrow();
    const privateBlock = { ...layout.pages[0].regions[0].blocks[0], type: 'WARD_LEADERSHIP', config: { text: 'private' } } as never;
    const unsafe = { ...layout, pages: [{ ...layout.pages[0], regions: [{ ...layout.pages[0].regions[0], blocks: [privateBlock] }] }] };
    expect(() => validatePublicDocumentLayout(unsafe)).toThrow(PublicSafetyError);
  });

  it('requires explicit approval for a structured announcement list and admits it when approved', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'NONE', coverMode: 'NONE' });
    const original = layout.pages[0].regions[0];
    const block = {
      ...original.blocks[0],
      type: 'ANNOUNCEMENT_LIST',
      config: { presentation: 'COMPACT_ROWS', items: [] }
    } as never;
    const publicLayout = {
      ...layout,
      pages: layout.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? { ...page, regions: page.regions.map((region, regionIndex) => (regionIndex === 0 ? { ...region, blocks: [block] } : region)) }
          : page
      )
    };
    expect(() => validatePublicDocumentLayout(publicLayout)).toThrow(/explicit public approval/);
    expect(() => validatePublicDocumentLayout(publicLayout, ['ANNOUNCEMENT_LIST'])).not.toThrow();
  });

  it('requires separate explicit approval for section headings and manually authored lists', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'NONE', coverMode: 'NONE' });
    const region = layout.pages[0].regions[0];
    const heading = {
      ...region.blocks[0],
      type: 'SECTION_HEADING',
      dataMode: 'MANUAL',
      config: { title: 'Community', subtitle: 'This week', presentation: 'ACCENT' }
    } as never;
    const list = {
      ...region.blocks[0],
      id: '33333333-3333-4333-8333-333333333333',
      type: 'SIMPLE_LIST',
      dataMode: 'MANUAL',
      config: { presentation: 'BULLETS', items: [{ id: '44444444-4444-4444-8444-444444444444', order: 0, text: 'Community clean-up' }] }
    } as never;
    const publicLayout = {
      ...layout,
      pages: layout.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              regions: page.regions.map((candidate, index) => (index === 0 ? { ...candidate, blocks: [heading, list] } : candidate))
            }
          : page
      )
    };

    expect(() => validatePublicDocumentLayout(publicLayout)).toThrow(/explicit public approval/);
    expect(() => validatePublicDocumentLayout(publicLayout, ['SECTION_HEADING'])).toThrow(/explicit public approval/);
    expect(() => validatePublicDocumentLayout(publicLayout, ['SECTION_HEADING', 'SIMPLE_LIST'])).not.toThrow();
  });
});
