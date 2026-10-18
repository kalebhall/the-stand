import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { resolveDocumentData } from './data-resolver';
import { renderDocumentHtml } from './renderer';
import { normalizeToAdvanced } from './advanced-schema';

describe('generic document renderer', () => {
  it.each([
    ['LABEL_VALUE', 'document-meeting-program--label-value'],
    ['DOTTED_LEADERS', 'document-meeting-program--dotted-leaders'],
    ['CENTERED_STACKED', 'document-meeting-program--centered-stacked']
  ] as const)('renders the %s meeting-program presentation', (presentation, className) => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    for (const region of layout.pages.flatMap((page) => page.regions))
      for (const block of region.blocks)
        if (block.type === 'MEETING_PROGRAM') block.config = { ...block.config, presentation } as typeof block.config;
    const { data } = resolveDocumentData(layout, {
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      wardName: 'Ward',
      programItems: [{ order: 1, label: 'Opening hymn', details: 'Hymn 2' }]
    });
    const output = renderDocumentHtml({ layout, data });
    expect(output.html).toContain(className);
    expect(output.html).toContain('Opening hymn');
    expect(output.html).toContain('Hymn 2');
  });

  it.each([
    ['COMPACT_ROWS', 'document-announcement-list--compact-rows'],
    ['DETAIL_CARDS', 'document-announcement-list--detail-cards']
  ] as const)('renders every public announcement field in %s mode', (presentation, className) => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const original = layout.pages[0].regions[0].blocks[0];
    const announcementBlock = {
      ...original,
      type: 'ANNOUNCEMENT_LIST',
      dataMode: 'MANUAL',
      config: {
        presentation,
        items: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            order: 0,
            date: 'Sunday, November 2',
            time: '6:00 PM',
            title: 'Ward dinner',
            description: 'Bring a side dish.',
            location: 'Cultural hall',
            contact: 'Relief Society'
          }
        ]
      }
    } as never;
    const announcementLayout = {
      ...layout,
      pages: layout.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              regions: page.regions.map((region, regionIndex) => (regionIndex === 0 ? { ...region, blocks: [announcementBlock] } : region))
            }
          : page
      )
    };
    const { data } = resolveDocumentData(announcementLayout, {
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      programItems: []
    });

    const output = renderDocumentHtml({ layout: announcementLayout, data, explicitPublicBlockTypes: ['ANNOUNCEMENT_LIST'] });
    expect(output.html).toContain(className);
    for (const value of ['Ward dinner', 'Sunday, November 2', '6:00 PM', 'Bring a side dish.', 'Cultural hall', 'Relief Society'])
      expect(output.html).toContain(value);
  });

  it('renders section heading presentations and simple-list semantics from safe manual content', () => {
    const base = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'NONE', coverMode: 'NONE' });
    const sourceBlock = base.pages[0].regions[0].blocks[0];
    const heading = {
      ...sourceBlock,
      type: 'SECTION_HEADING',
      dataMode: 'MANUAL',
      config: { title: 'This week', subtitle: 'Upcoming activities', presentation: 'ACCENT' }
    };
    const list = {
      ...sourceBlock,
      id: '33333333-3333-4333-8333-333333333333',
      type: 'SIMPLE_LIST',
      dataMode: 'MANUAL',
      config: {
        presentation: 'NUMBERED',
        items: [
          { id: '44444444-4444-4444-8444-444444444444', order: 0, text: 'Food drive' },
          { id: '55555555-5555-4555-8555-555555555555', order: 1, text: 'Youth activity' }
        ]
      }
    };
    const layout = {
      ...base,
      pages: base.pages.map((page, index) => (index === 0 ? { ...page, regions: [{ ...page.regions[0], blocks: [heading, list] }] } : page))
    } as never;
    const { data } = resolveDocumentData(layout, { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', programItems: [] });
    const digital = renderDocumentHtml({ layout, data, public: true, explicitPublicBlockTypes: ['SECTION_HEADING', 'SIMPLE_LIST'] });
    const mobile = renderDocumentHtml({
      layout,
      data,
      public: true,
      mobile: true,
      explicitPublicBlockTypes: ['SECTION_HEADING', 'SIMPLE_LIST']
    });
    const print = renderDocumentHtml({
      layout,
      data,
      target: 'PRINT',
      public: true,
      explicitPublicBlockTypes: ['SECTION_HEADING', 'SIMPLE_LIST']
    });
    for (const output of [digital, mobile, print]) {
      expect(output.html).toContain('document-section-heading--accent');
      expect(output.html).toContain('<h2>This week</h2>');
      expect(output.html).toContain('Upcoming activities');
      expect(output.html).toContain('<ol class="document-block document-simple-list document-simple-list--numbered">');
      expect(output.html.indexOf('Food drive')).toBeLessThan(output.html.indexOf('Youth activity'));
    }
    expect(mobile.html).toContain('document-root--mobile');
    expect(print.html).not.toContain('@media screen');
  });

  it('preserves multiline headings, announcement titles, and list items in HTML', () => {
    const base = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'NONE', coverMode: 'NONE' });
    const original = base.pages[0].regions[0].blocks[0];
    const blocks = [
      {
        ...original,
        id: '66666666-6666-4666-8666-666666666666',
        type: 'SECTION_HEADING',
        dataMode: 'MANUAL',
        config: { title: 'This week\nActivities', presentation: 'RULE' }
      },
      {
        ...original,
        id: '77777777-7777-4777-8777-777777777777',
        type: 'SIMPLE_LIST',
        dataMode: 'MANUAL',
        config: {
          presentation: 'BULLETS',
          items: [{ id: '88888888-8888-4888-8888-888888888888', order: 0, text: 'Food drive\nBring canned goods' }]
        }
      },
      {
        ...original,
        id: '99999999-9999-4999-8999-999999999999',
        type: 'ANNOUNCEMENT_LIST',
        dataMode: 'MANUAL',
        config: {
          presentation: 'COMPACT_ROWS',
          items: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', order: 0, title: 'Community dinner\nSaturday evening' }]
        }
      }
    ];
    const layout = {
      ...base,
      pages: base.pages.map((page, index) => (index === 0 ? { ...page, regions: [{ ...page.regions[0], blocks }] } : page))
    } as never;
    const { data } = resolveDocumentData(layout, { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', programItems: [] });
    const outputs = [
      renderDocumentHtml({ layout, data }),
      renderDocumentHtml({ layout, data, mobile: true }),
      renderDocumentHtml({ layout, data, target: 'PRINT' })
    ];

    for (const output of outputs) {
      expect(output.html).toContain('.document-section-heading h2{margin:0;white-space:pre-line}');
      expect(output.html).toContain(
        '.document-announcement-list__item h3{font-size:1em;font-weight:600;margin:0 0 .2rem;white-space:pre-line}'
      );
      expect(output.html).toContain('.document-simple-list li{white-space:pre-line}');
      for (const value of ['This week\nActivities', 'Community dinner\nSaturday evening', 'Food drive\nBring canned goods'])
        expect(output.html).toContain(value);
    }
  });

  it('collapses panels, advanced columns, and agenda label/value rows on mobile', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const { data } = resolveDocumentData(layout, { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', programItems: [] });
    const output = renderDocumentHtml({ layout, data });
    expect(output.html).toContain('.document-columns{grid-template-columns:1fr !important;}');
    expect(output.html).toContain('.document-key-value{grid-template-columns:1fr;}');
  });

  it('forces one-column geometry in phone-preview mode even on a desktop viewport', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const { data } = resolveDocumentData(layout, { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', programItems: [] });
    const output = renderDocumentHtml({ layout, data, mobile: true });
    expect(output.html).toContain('class="document-root document-fold--bifold document-root--mobile"');
    expect(output.html).toContain(
      '.document-root--mobile .document-panels,.document-root--mobile .document-columns{grid-template-columns:1fr !important;}'
    );
  });

  it('expands narrow advanced blocks on digital mobile and keeps print geometry independent of viewport CSS', () => {
    const source = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const advanced = normalizeToAdvanced(source);
    const firstRegion = advanced.pages[0].regions[0];
    const [firstBlock, ...remainingBlocks] = firstRegion.blocks;
    const mobileLayout = {
      ...advanced,
      pages: [
        {
          ...advanced.pages[0],
          regions: [
            {
              ...firstRegion,
              blocks: [{ ...firstBlock, width: 'ONE_THIRD' as const }, ...remainingBlocks],
              columns: {
                ...firstRegion.columns,
                count: 2 as const,
                blockIds: [[firstBlock.id], remainingBlocks.map((block) => block.id)]
              }
            },
            ...advanced.pages[0].regions.slice(1)
          ]
        },
        ...advanced.pages.slice(1)
      ]
    };
    const { data } = resolveDocumentData(
      mobileLayout,
      { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', programItems: [] },
      { preserveAdvancedLayout: true }
    );
    const mobile = renderDocumentHtml({ layout: mobileLayout, data, mobile: true });
    const print = renderDocumentHtml({ layout: mobileLayout, data, target: 'PRINT' });

    expect(mobile.html).toContain('max-width:33.3333%');
    expect(mobile.html).toContain('.document-root--mobile .document-block{max-width:100% !important;width:100% !important;}');
    expect(mobile.html).toContain('.document-columns{grid-template-columns:1fr !important;}');
    expect(print.html).not.toContain('@media screen');
    expect(print.html).not.toContain('document-root--mobile');
  });

  it('produces deterministic digital and print output with logical order and escaping', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const { data } = resolveDocumentData(layout, {
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      wardName: '<Ward>',
      programItems: [{ order: 1, label: 'Opening hymn', details: 'Hymn 2' }]
    });
    const options = {
      public: true,
      explicitPublicBlockTypes: ['MEETING_PROGRAM', 'PRESIDING_CONDUCTING', 'MUSIC_LEADERS', 'ANNOUNCEMENTS', 'QR_CODE']
    } as const;
    const first = renderDocumentHtml({ layout, data, ...options });
    const second = renderDocumentHtml({ layout, data, ...options });
    const print = renderDocumentHtml({ layout, data, target: 'PRINT', ...options });
    expect(first.html).toBe(second.html);
    expect(first.html).toContain('&lt;Ward&gt;');
    expect(first.html).toContain('Opening hymn');
    expect(print.metadata.target).toBe('PRINT');
  });

  it('resolves reusable custom text per block in advanced HTML output', () => {
    const base = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const region = base.pages[0].regions[0];
    const first = {
      ...region.blocks[0],
      id: '11111111-1111-4111-8111-111111111111',
      type: 'CUSTOM_TEXT' as const,
      source: { key: 'MEETING_DATE' as const },
      config: { text: 'RAW_DATE' }
    };
    const second = {
      ...region.blocks[0],
      id: '22222222-2222-4222-8222-222222222222',
      type: 'CUSTOM_TEXT' as const,
      source: { key: 'WARD_NAME' as const },
      config: { text: 'RAW_WARD' }
    };
    const advanced = {
      ...base,
      pages: [
        {
          ...base.pages[0],
          regions: [{ ...region, blocks: [first, second], columns: { ...region.columns, blockIds: [[first.id, second.id]] } }]
        }
      ]
    };
    const { layout, data } = resolveDocumentData(
      advanced,
      {
        meetingDate: '2026-01-04',
        meetingType: 'SACRAMENT',
        wardName: 'Freedom Park Ward',
        programItems: []
      },
      { preserveAdvancedLayout: true }
    );
    const output = renderDocumentHtml({ layout, data });
    expect(output.html).toContain('2026-01-04');
    expect(output.html).toContain('Freedom Park Ward');
    expect(output.html).not.toContain('RAW_DATE');
    expect(output.html).not.toContain('RAW_WARD');
  });

  it('uses semantic face identity when folded regions are reordered', () => {
    const source = adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const advanced = normalizeToAdvanced(source);
    advanced.pages[0].regions = [...advanced.pages[0].regions].reverse();
    const { data } = resolveDocumentData(
      advanced,
      { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', wardName: 'Ward', programItems: [] },
      { preserveAdvancedLayout: true }
    );
    const output = renderDocumentHtml({ layout: advanced, data, target: 'PRINT' });
    const firstSide = output.html.split('data-side-index="0"')[1]?.split('data-side-index="1"')[0] ?? '';
    expect(firstSide.indexOf('data-region-face="BACK_COVER"')).toBeLessThan(firstSide.indexOf('data-region-face="FRONT_COVER"'));
  });

  it.each([
    ['BIFOLD', 2],
    ['TRIFOLD', 2],
    ['HALF_SHEET', 2]
  ] as const)('renders each %s side as a separate printable physical page', (fold, expectedPages) => {
    const preset = fold === 'TRIFOLD' ? 'TRI_FOLD_BULLETIN' : fold === 'BIFOLD' ? 'SINGLE_SHEET_BIFOLD' : 'FULL_PAGE';
    const source = adaptLegacyLayoutToDocument({ preset, announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const advanced = normalizeToAdvanced({ ...source, fold });
    const { data } = resolveDocumentData(
      advanced,
      { meetingDate: '2026-01-04', meetingType: 'SACRAMENT', wardName: 'Ward', programItems: [] },
      { preserveAdvancedLayout: true }
    );
    const output = renderDocumentHtml({ layout: advanced, data, target: 'PRINT' });
    expect(output.html.match(/class="document-page"/g)?.length).toBe(expectedPages);
    expect(output.html).toContain('data-side-index="1"');
  });
});
