// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';

import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';
import { downgradeToV1, normalizeToAdvanced } from '@/src/document-designer/advanced-schema';
import { BUILT_IN_TEMPLATES } from '@/src/document-designer/built-in-templates';
import { ProgramDesignerClient } from './program-designer-client';

const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const payload = {
  document: { id: 'document-1', layout, theme: layout.theme, revision: 1, sourceTemplateId: null, sourceTemplateVersion: null },
  previewSource: { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward', programItems: [] }
};
const advancedLayout = normalizeToAdvanced(layout);
const baseRegion = advancedLayout.pages[0].regions[0];
const targetBlock = baseRegion.blocks.find((block) => block.type === 'WARD_NAME')!;
const multiRegionAdvancedLayout = {
  ...advancedLayout,
  pages: advancedLayout.pages.map((page, pageIndex) =>
    pageIndex === 0
      ? {
          ...page,
          regions: [
            {
              ...baseRegion,
              ratio: 0.5,
              blocks: baseRegion.blocks.filter((block) => block.id !== targetBlock.id),
              columns: {
                count: 1 as const,
                ratio: '1/1' as const,
                gutter: baseRegion.gutter,
                blockIds: [baseRegion.blocks.filter((block) => block.id !== targetBlock.id).map((block) => block.id)]
              }
            },
            {
              ...baseRegion,
              id: '00000000-0000-4000-8000-000000000099' as typeof baseRegion.id,
              face: 'PAGE' as const,
              ratio: 0.5,
              blocks: [targetBlock],
              columns: { count: 1 as const, ratio: '1/1' as const, gutter: baseRegion.gutter, blockIds: [[targetBlock.id]] }
            }
          ]
        }
      : page
  )
};
const multiRegionPayload = {
  ...payload,
  document: { ...payload.document, layout: downgradeToV1(multiRegionAdvancedLayout), advancedLayout: multiRegionAdvancedLayout },
  simpleMode: { advancedModeAvailable: true }
};
const staleAdvancedLayout = {
  ...advancedLayout,
  pages: advancedLayout.pages.map((page, pageIndex) =>
    pageIndex === 0
      ? {
          ...page,
          regions: page.regions.map((region, regionIndex) =>
            regionIndex === 0
              ? {
                  ...region,
                  blocks: [...region.blocks].reverse(),
                  columns: { ...region.columns, blockIds: region.columns.blockIds.map((ids) => [...ids].reverse()) }
                }
              : region
          )
        }
      : page
  )
};
const simplePayloadWithStaleAdvanced = {
  ...payload,
  document: { ...payload.document, advancedLayout: staleAdvancedLayout },
  simpleMode: { advancedModeAvailable: true }
};
const lockedSimpleLayout = {
  ...layout,
  pages: layout.pages.map((page, pageIndex) =>
    pageIndex === 0
      ? {
          ...page,
          regions: page.regions.map((region, regionIndex) =>
            regionIndex === 0 ? { ...region, lock: { level: 'REGION' as const, properties: ['POSITION'] as const } } : region
          )
        }
      : page
  )
};
const lockedPayload = { ...payload, document: { ...payload.document, layout: lockedSimpleLayout } };
const blockLockedLayout = {
  ...layout,
  pages: layout.pages.map((page) => ({
    ...page,
    regions: page.regions.map((region) => ({
      ...region,
      blocks: region.blocks.map((block) =>
        block.id === targetBlock.id ? { ...block, lock: { level: 'BLOCK' as const, properties: ['POSITION'] as const } } : block
      )
    }))
  }))
};
const blockLockedPayload = {
  ...payload,
  document: { ...payload.document, layout: blockLockedLayout, advancedLayout: normalizeToAdvanced(blockLockedLayout) },
  simpleMode: { advancedModeAvailable: true }
};
const columnLockedAdvancedLayout = {
  ...advancedLayout,
  pages: advancedLayout.pages.map((page, pageIndex) =>
    pageIndex === 0
      ? {
          ...page,
          regions: page.regions.map((region, regionIndex) =>
            regionIndex === 0
              ? {
                  ...region,
                  blocks: region.blocks.map((block) =>
                    block.type === 'WARD_NAME' ? { ...block, lock: { level: 'BLOCK' as const, properties: ['POSITION'] as const } } : block
                  )
                }
              : region
          )
        }
      : page
  )
};
const columnLockedPayload = {
  ...payload,
  document: {
    ...payload.document,
    layout: downgradeToV1(columnLockedAdvancedLayout),
    advancedLayout: columnLockedAdvancedLayout
  },
  simpleMode: { advancedModeAvailable: true }
};
const contentLockedAdvancedLayout = {
  ...advancedLayout,
  pages: advancedLayout.pages.map((page) => ({
    ...page,
    regions: page.regions.map((region) => ({
      ...region,
      blocks: region.blocks.map((block) =>
        block.type === 'DOCUMENT_TITLE' ? { ...block, lock: { level: 'BLOCK' as const, properties: ['CONTENT'] as const } } : block
      )
    }))
  }))
};
const contentLockedPayload = {
  ...payload,
  document: {
    ...payload.document,
    layout: downgradeToV1(contentLockedAdvancedLayout),
    advancedLayout: contentLockedAdvancedLayout
  },
  simpleMode: { advancedModeAvailable: true }
};
const styleLockedAdvancedLayout = {
  ...advancedLayout,
  lock: { level: 'CONFIGURATION' as const, properties: ['STYLE'] as const }
};
const styleLockedPayload = {
  ...payload,
  document: { ...payload.document, layout: downgradeToV1(styleLockedAdvancedLayout), advancedLayout: styleLockedAdvancedLayout },
  simpleMode: { advancedModeAvailable: true }
};
const reusableContentLockedAdvancedLayout = {
  ...contentLockedAdvancedLayout,
  pages: contentLockedAdvancedLayout.pages.map((page) => ({
    ...page,
    regions: page.regions.map((region) => ({
      ...region,
      blocks: region.blocks.map((block) =>
        block.type === 'DOCUMENT_TITLE'
          ? { ...block, reusableBlockId: '00000000-0000-4000-8000-000000000002', reusableBlockVersion: 1 }
          : block
      )
    }))
  }))
};
const reusableContentLockedPayload = {
  ...payload,
  document: {
    ...payload.document,
    layout: downgradeToV1(reusableContentLockedAdvancedLayout),
    advancedLayout: reusableContentLockedAdvancedLayout
  },
  simpleMode: { advancedModeAvailable: true }
};
const spatialLayout = adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const legacySpatialAdvancedLayout = {
  ...spatialLayout,
  schemaVersion: 2 as const,
  pages: spatialLayout.pages.map((page) => ({
    ...page,
    regions: page.regions.map((region) => ({
      ...region,
      columns: { count: 1 as const, ratio: '1/1' as const, gutter: region.gutter, blockIds: [region.blocks.map((block) => block.id)] }
    }))
  }))
};
const spatialPayload = {
  ...payload,
  document: { ...payload.document, layout: spatialLayout, advancedLayout: legacySpatialAdvancedLayout },
  simpleMode: { advancedModeAvailable: true }
};
const twoColumnAdvancedLayout = {
  ...advancedLayout,
  pages: advancedLayout.pages.map((page, pageIndex) =>
    pageIndex === 0
      ? {
          ...page,
          regions: page.regions.map((region, regionIndex) => {
            if (regionIndex !== 0) return region;
            const titleBlock = region.blocks.find((block) => block.type === 'DOCUMENT_TITLE')!;
            return {
              ...region,
              columns: {
                count: 2 as const,
                ratio: '1/3+2/3' as const,
                gutter: region.gutter,
                blockIds: [[titleBlock.id], region.blocks.filter((block) => block.id !== titleBlock.id).map((block) => block.id)]
              }
            };
          })
        }
      : page
  )
};
const twoColumnSpatialPayload = {
  ...payload,
  document: { ...payload.document, advancedLayout: twoColumnAdvancedLayout },
  simpleMode: { advancedModeAvailable: true }
};
const trifoldLayout = adaptLegacyLayoutToDocument({ preset: 'TRI_FOLD_BULLETIN', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const legacyTrifoldAdvancedLayout = {
  ...trifoldLayout,
  schemaVersion: 2 as const,
  pages: trifoldLayout.pages.map((page) => ({
    ...page,
    regions: page.regions.map((region) => ({
      ...region,
      columns: { count: 1 as const, ratio: '1/1' as const, gutter: region.gutter, blockIds: [region.blocks.map((block) => block.id)] }
    }))
  }))
};
const advancedTemplatePayload = {
  ...payload,
  document: { ...payload.document, layout: trifoldLayout, advancedLayout: legacyTrifoldAdvancedLayout },
  simpleMode: { advancedModeAvailable: true }
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const renderWithMessages = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
      {ui}
    </NextIntlClientProvider>
  );
const dropAt = (target: Element, dataTransfer: object, clientY: number) => {
  const event = createEvent.drop(target, { dataTransfer } as unknown as DragEventInit);
  Object.defineProperty(event, 'clientY', { configurable: true, value: clientY });
  fireEvent(target, event);
};

describe('ProgramDesignerClient', { timeout: 15_000 }, () => {
  it('loads without issuing an initial save and exposes accessible editor regions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    expect(await screen.findByRole('region', { name: 'Document canvas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Approved blocks' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Blocks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Core sections' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    expect(screen.getAllByText('No blocks in this category.').length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/w/ward-1/meetings/meeting-1/program-design',
      '/api/w/ward-1/document-templates',
      '/api/w/ward-1/media',
      '/api/w/ward-1/reusable-blocks'
    ]);
  });

  it('debounces one save after a user change and sends the current revision', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ revision: 2, document: { ...payload.document, layout: payload.document.layout, revision: 2 } })
      });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'HIDDEN' } });
    await waitFor(
      () => expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(true),
      { timeout: 1200 }
    );
    const putCall = fetchMock.mock.calls.find(([, options]) => (options as RequestInit | undefined)?.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(JSON.parse(String(putCall?.[1] && (putCall[1] as RequestInit).body)).expectedRevision).toBe(1);
  });
  it('keeps block order controls disabled when the region position is locked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => lockedPayload }));
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });

    const approvedBlocks = screen.getByRole('complementary', { name: 'Approved blocks' });
    const titleRow = within(approvedBlocks).getByText('Document title', { exact: true }).closest('li');
    expect(titleRow).toHaveAttribute('draggable', 'false');
    expect(screen.getByRole('button', { name: 'Move Document title down' })).toBeDisabled();
  });

  it('rejects simple-mode arrow reordering when it would move a position-locked neighbor', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => blockLockedPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => blockLockedPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });

    const approvedBlocks = screen.getByRole('complementary', { name: 'Approved blocks' });
    const beforeOrder = Array.from(approvedBlocks.querySelectorAll('ul > li')).map((row) => row.textContent);
    fireEvent.click(screen.getByRole('button', { name: 'Move Document title down' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/locked/i);
    expect(Array.from(approvedBlocks.querySelectorAll('ul > li')).map((row) => row.textContent)).toEqual(beforeOrder);
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('rejects Advanced Mode arrow reordering when it would move a position-locked neighbor', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => blockLockedPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => blockLockedPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));

    const approvedBlocks = screen.getByRole('complementary', { name: 'Approved blocks' });
    const beforeOrder = Array.from(approvedBlocks.querySelectorAll('ul > li')).map((row) => row.textContent);
    fireEvent.click(screen.getByRole('button', { name: 'Move Document title down' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/locked/i);
    expect(Array.from(approvedBlocks.querySelectorAll('ul > li')).map((row) => row.textContent)).toEqual(beforeOrder);
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('rejects cross-region moves that would shift a position-locked block', async () => {
    const lockedSourceLayout = {
      ...multiRegionAdvancedLayout,
      pages: multiRegionAdvancedLayout.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              regions: page.regions.map((region, regionIndex) =>
                regionIndex === 0
                  ? {
                      ...region,
                      blocks: region.blocks.map((block) =>
                        block.type === 'MEETING_INFO'
                          ? { ...block, lock: { level: 'BLOCK' as const, properties: ['POSITION'] as const } }
                          : block
                      )
                    }
                  : region
              )
            }
          : page
      )
    };
    const lockedSourcePayload = {
      ...multiRegionPayload,
      document: { ...multiRegionPayload.document, advancedLayout: lockedSourceLayout }
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => lockedSourcePayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => lockedSourcePayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Region 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));

    const sourceRegion = screen.getByRole('region', { name: 'Region 1' });
    const targetRegion = screen.getByRole('region', { name: 'Region 2' });
    const titleButton = within(sourceRegion).getByRole('button', { name: /Document title/ });
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      values: {} as Record<string, string>,
      setData(format: string, value: string) {
        this.values[format] = value;
      },
      getData(format: string) {
        return this.values[format] ?? '';
      }
    };
    fireEvent.dragStart(titleButton, { dataTransfer });
    fireEvent.dragOver(targetRegion, { dataTransfer });
    dropAt(targetRegion, dataTransfer, 1000);

    expect(screen.getByRole('alert')).toHaveTextContent(/locked/i);
    expect(within(sourceRegion).getByRole('button', { name: /Document title/ })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('rejects Advanced Mode column reconfiguration that moves a position-locked block', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => columnLockedPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => columnLockedPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));

    const columns = screen.getByRole('combobox', { name: 'Columns in selected panel' });
    fireEvent.change(columns, { target: { value: '2' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/locked/i);
    expect(columns).toHaveValue('1');
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('rejects removal when it would shift a position-locked neighbor', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => columnLockedPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => columnLockedPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    const approvedBlocks = screen.getByRole('complementary', { name: 'Approved blocks' });
    fireEvent.click(within(approvedBlocks).getByText('Document title', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/locked/i);
    expect(within(approvedBlocks).getByText('Ward name', { exact: true })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('disables Advanced Mode arrow moves at each column boundary', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => twoColumnSpatialPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => twoColumnSpatialPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));

    expect(screen.getByRole('button', { name: 'Move Document title down' })).toBeDisabled();
  });

  it('rejects Advanced Mode content changes on a CONTENT-locked block before mutating local state', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => contentLockedPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => contentLockedPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'Forbidden content edit' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/locked/i);
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Sacrament Meeting');
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('rejects theme changes on a STYLE-locked document before mutating local state', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => styleLockedPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => styleLockedPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    const font = screen.getByRole('combobox', { name: 'Font' });
    fireEvent.change(font, { target: { value: 'SERIF' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/locked/i);
    expect(font).toHaveValue('SYSTEM_SANS');
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('rejects applying a newer reusable version to a CONTENT-locked Advanced block', async () => {
    const reusableItem = {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Locked title source',
      description: null,
      current_version: 2,
      snapshot_json: {
        blockType: 'DOCUMENT_TITLE',
        config: { text: 'New reusable title' },
        width: 'FULL',
        visibility: 'VISIBLE',
        printBehavior: 'PRINT_AND_DIGITAL',
        digitalBehavior: 'NORMAL'
      }
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => reusableContentLockedPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [reusableItem] }) };
      return { ok: true, json: async () => reusableContentLockedPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update block' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/locked/i);
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Sacrament Meeting');
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('keeps simple-mode edits in the advanced preview projection immediately', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Approved blocks' })).getByText('Document title', { exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'Immediate simple draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desktop preview' }));

    expect(screen.getByText('Immediate simple draft')).toBeInTheDocument();
  });

  it('keeps simple preview current after a failed autosave', async () => {
    let putCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        putCount += 1;
        return { ok: false, status: 500, json: async () => ({ error: 'save unavailable' }) };
      }
      if (url.endsWith('/program-design')) return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Approved blocks' })).getByText('Document title', { exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'Draft survives save failure' } });
    await waitFor(() => expect(putCount).toBeGreaterThan(0), { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: 'Desktop preview' }));

    expect(screen.getByText('Draft survives save failure')).toBeInTheDocument();
  });

  it.each([409, 500])('stays in Advanced Edit mode when saving before preview fails with HTTP %i', async (statusCode) => {
    let putCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        putCount += 1;
        return statusCode === 409
          ? { ok: false, status: statusCode, json: async () => ({ error: 'conflict', code: 'REVISION_CONFLICT', currentRevision: 2 }) }
          : { ok: false, status: statusCode, json: async () => ({ error: 'save unavailable' }) };
      }
      if (url.endsWith('/program-design')) return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Approved blocks' })).getByText('Document title', { exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'Advanced unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desktop preview' }));
    await waitFor(() => expect(putCount).toBe(1));

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Simple Mode' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Desktop preview' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps a newly inserted simple reusable block movable while the advanced shadow is stale', async () => {
    const reusableItem = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Simple reusable text',
      description: null,
      current_version: 1,
      snapshot_json: {
        blockType: 'DIVIDER',
        config: { style: 'SOLID' },
        width: 'FULL',
        visibility: 'VISIBLE',
        printBehavior: 'PRINT_AND_DIGITAL',
        digitalBehavior: 'NORMAL'
      }
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/program-design')) return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [reusableItem] }) };
      return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Reusable blocks' }));
    fireEvent.click(screen.getByRole('button', { name: /Simple reusable text/ }));

    const inserted = within(screen.getByRole('region', { name: 'Document canvas' })).getByRole('button', { name: /DividerVisible/ });
    expect(inserted).toHaveAttribute('draggable', 'true');
  });

  it('drags blocks into a new order in the standard editor and saves the reordered layout', async () => {
    let savedLayout: typeof layout | null = null;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        const request = JSON.parse(String(options.body)) as { document: typeof layout };
        savedLayout = request.document;
        return { ok: true, json: async () => ({ revision: 2, document: request.document }) };
      }
      if (url.endsWith('/program-design')) return { ok: true, json: async () => simplePayloadWithStaleAdvanced };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });

    const approvedBlocks = screen.getByRole('complementary', { name: 'Approved blocks' });
    const initialRows = Array.from(approvedBlocks.querySelectorAll('ul > li'));
    expect(initialRows[0]?.textContent).toContain('Document title');
    expect(initialRows[1]?.textContent).toContain('Ward name');
    const titleRow = within(approvedBlocks).getByText('Document title', { exact: true }).closest('li');
    const wardNameRow = within(approvedBlocks).getByText('Ward name', { exact: true }).closest('li');
    expect(titleRow).not.toBeNull();
    expect(wardNameRow).not.toBeNull();
    expect(titleRow).toHaveAttribute('draggable', 'true');
    expect(wardNameRow).toHaveAttribute('draggable', 'true');

    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      values: {} as Record<string, string>,
      setData: vi.fn(function (this: { values: Record<string, string> }, format: string, value: string) {
        this.values[format] = value;
      }),
      getData: vi.fn(function (this: { values: Record<string, string> }, format: string) {
        return this.values[format] ?? '';
      })
    };
    fireEvent.dragStart(titleRow!, { dataTransfer });
    expect(dataTransfer.getData('text/plain')).toBe(layout.pages[0].regions[0].blocks[0].id);
    fireEvent.dragOver(wardNameRow!, { dataTransfer, clientY: 1000 });
    dropAt(wardNameRow!, dataTransfer, 1000);
    expect(dataTransfer.getData).toHaveBeenCalledWith('text/plain');
    const currentApprovedBlocks = screen.getByRole('complementary', { name: 'Approved blocks' });
    const currentRows = Array.from(currentApprovedBlocks.querySelectorAll('ul > li'));
    expect(currentRows[0]?.textContent).toContain('Ward name');
    expect(currentRows[1]?.textContent).toContain('Document title');

    const titleAtSecondPosition = within(currentApprovedBlocks).getByText('Document title', { exact: true }).closest('li');
    fireEvent.dragStart(titleAtSecondPosition!, { dataTransfer });
    expect(dataTransfer.getData('text/plain')).toBe(layout.pages[0].regions[0].blocks[0].id);
    vi.spyOn(currentRows[0]!, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 100 } as DOMRect);
    fireEvent.dragOver(currentRows[0]!, { dataTransfer, clientY: 110 });
    dropAt(currentRows[0]!, dataTransfer, 110);
    const beforeRows = Array.from(screen.getByRole('complementary', { name: 'Approved blocks' }).querySelectorAll('ul > li'));
    expect(beforeRows[0]?.textContent).toContain('Document title');
    expect(beforeRows[1]?.textContent).toContain('Ward name');

    const firstRow = beforeRows[0];
    const thirdRow = beforeRows[2];
    expect(firstRow).toBeDefined();
    expect(thirdRow).toBeDefined();
    fireEvent.dragStart(firstRow!, { dataTransfer });
    fireEvent.dragOver(thirdRow!, { dataTransfer, clientY: 1000 });
    dropAt(thirdRow!, dataTransfer, 1000);
    const nonAdjacentRows = Array.from(screen.getByRole('complementary', { name: 'Approved blocks' }).querySelectorAll('ul > li'));
    expect(nonAdjacentRows[0]?.textContent).toContain('Ward name');
    expect(nonAdjacentRows[1]?.textContent).toContain(thirdRow!.textContent);
    expect(nonAdjacentRows[2]?.textContent).toContain('Document title');
    const beforeNoOpOrder = nonAdjacentRows.map((row) => row.textContent);
    fireEvent.dragStart(nonAdjacentRows[2]!, { dataTransfer });
    dropAt(nonAdjacentRows[2]!, dataTransfer, 1000);
    const afterNoOpOrder = Array.from(screen.getByRole('complementary', { name: 'Approved blocks' }).querySelectorAll('ul > li')).map(
      (row) => row.textContent
    );
    expect(afterNoOpOrder).toEqual(beforeNoOpOrder);

    await waitFor(() => expect(savedLayout).not.toBeNull(), { timeout: 1200 });
    expect(savedLayout!.pages[0].regions[0].blocks.map((block) => block.type).slice(0, 3)).toEqual([
      layout.pages[0].regions[0].blocks[1].type,
      layout.pages[0].regions[0].blocks[2].type,
      layout.pages[0].regions[0].blocks[0].type
    ]);
  });

  it('drags blocks between positions in Advanced Mode and saves the advanced layout', async () => {
    let savedDocument: unknown = null;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        const request = JSON.parse(String(options.body)) as { document: unknown };
        savedDocument = request.document;
        return { ok: true, json: async () => ({ revision: 2, document: request.document }) };
      }
      if (url.endsWith('/program-design')) return { ok: true, json: async () => twoColumnSpatialPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => twoColumnSpatialPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));

    const approvedBlocks = screen.getByRole('complementary', { name: 'Approved blocks' });
    const titleRow = within(approvedBlocks).getByText('Document title', { exact: true }).closest('li');
    const wardNameRow = within(approvedBlocks).getByText('Ward name', { exact: true }).closest('li');
    const titleBlockId = twoColumnSpatialPayload.document.advancedLayout.pages[0].regions[0].blocks.find(
      (block) => block.type === 'DOCUMENT_TITLE'
    )?.id;
    expect(titleBlockId).toBeDefined();
    expect(titleRow).toHaveAttribute('draggable', 'true');
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      values: {} as Record<string, string>,
      setData(format: string, value: string) {
        this.values[format] = value;
      },
      getData(format: string) {
        return this.values[format] ?? '';
      }
    };
    fireEvent.dragStart(titleRow!, { dataTransfer });
    fireEvent.dragOver(wardNameRow!, { dataTransfer });
    dropAt(wardNameRow!, dataTransfer, 1000);
    const currentApprovedBlocks = screen.getByRole('complementary', { name: 'Approved blocks' });
    const currentRows = Array.from(currentApprovedBlocks.querySelectorAll('ul > li'));
    expect(currentRows[0]?.textContent).toContain('Ward name');
    expect(currentRows[1]?.textContent).toContain('Document title');

    fireEvent.click(screen.getByRole('button', { name: 'Save advanced layout' }));
    await waitFor(() => expect(savedDocument).not.toBeNull());
    const savedLayout = savedDocument as {
      schemaVersion: number;
      pages: Array<{ regions: Array<{ blocks: Array<{ id: string; type: string }>; columns: { count: number; blockIds: string[][] } }> }>;
    };
    expect(savedLayout.schemaVersion).toBe(2);
    const savedRegion = savedLayout.pages[0].regions[0];
    expect(savedRegion.blocks.map((block) => block.type).slice(0, 2)).toEqual(['WARD_NAME', 'DOCUMENT_TITLE']);
    expect(savedRegion.columns.count).toBe(2);
    expect(savedRegion.columns.blockIds[0]).not.toContain(titleBlockId);
    expect(savedRegion.columns.blockIds[1]).toContain(titleBlockId);
  });

  it('moves a block across Advanced Mode regions and saves the updated column assignments', async () => {
    let savedDocument: unknown = null;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        const request = JSON.parse(String(options.body)) as { document: unknown };
        savedDocument = request.document;
        return { ok: true, json: async () => ({ revision: 2, document: request.document }) };
      }
      if (url.endsWith('/program-design')) return { ok: true, json: async () => multiRegionPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => multiRegionPayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Region 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));

    const frontCover = screen.getByRole('region', { name: 'Region 1' });
    const insideLeft = screen.getByRole('region', { name: 'Region 2' });
    const sourceButton = within(frontCover).getByRole('button', { name: /Document title/ });
    const targetButton = within(insideLeft).getByRole('button', { name: /Ward name/ });
    const sourceId = multiRegionPayload.document.advancedLayout.pages[0].regions[0].blocks.find(
      (block) => block.type === 'DOCUMENT_TITLE'
    )?.id;
    const targetId = multiRegionPayload.document.advancedLayout.pages[0].regions[1].blocks[0]?.id;
    expect(sourceId).toBeDefined();
    expect(targetId).toBeDefined();

    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      values: {} as Record<string, string>,
      setData(format: string, value: string) {
        this.values[format] = value;
      },
      getData(format: string) {
        return this.values[format] ?? '';
      }
    };
    fireEvent.dragStart(sourceButton, { dataTransfer });
    fireEvent.dragOver(targetButton, { dataTransfer });
    dropAt(targetButton, dataTransfer, 1000);

    fireEvent.click(screen.getByRole('button', { name: 'Save advanced layout' }));
    await waitFor(() => expect(savedDocument).not.toBeNull());
    const savedLayout = savedDocument as typeof multiRegionPayload.document.advancedLayout;
    const sourceRegion = savedLayout.pages[0].regions[0];
    const targetRegion = savedLayout.pages[0].regions[1];
    expect(sourceRegion.blocks.some((block) => block.id === sourceId)).toBe(false);
    expect(targetRegion.blocks.findIndex((block) => block.id === sourceId)).toBeGreaterThan(
      targetRegion.blocks.findIndex((block) => block.id === targetId)
    );
    expect(sourceRegion.columns.blockIds.flat()).not.toContain(sourceId);
    expect(targetRegion.columns.blockIds.flat()).toContain(sourceId);
  });

  it('queues the latest advanced draft while a save is in flight', async () => {
    let putCount = 0;
    const putDocuments: unknown[] = [];
    const putExpectedRevisions: number[] = [];
    let resolveFirst: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        putCount += 1;
        const request = JSON.parse(String(options.body)) as { document: unknown; expectedRevision: number };
        putDocuments.push(request.document);
        putExpectedRevisions.push(request.expectedRevision);
        if (putCount === 1) {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return { ok: true, json: async () => ({ revision: putCount + 1, document: request.document }) };
      }
      if (url.endsWith('/program-design')) return { ok: true, json: async () => spatialPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Front cover' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save advanced layout' }));
    await waitFor(() => expect(putCount).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Add to panel' }));
    resolveFirst?.();
    await waitFor(() => expect(putCount).toBe(2));
    expect(putDocuments[1]).not.toEqual(putDocuments[0]);
    expect(putExpectedRevisions).toEqual([1, 2]);
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });
  it('retries a failed advanced save with the advanced payload', async () => {
    let putCount = 0;
    const putRequests: Array<{ mode: string; document: unknown; expectedRevision: number }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        putCount += 1;
        const request = JSON.parse(String(options.body)) as { mode: string; document: unknown; expectedRevision: number };
        putRequests.push(request);
        if (putCount === 1)
          return { ok: false, status: 409, json: async () => ({ error: 'conflict', code: 'REVISION_CONFLICT', currentRevision: 2 }) };
        return { ok: true, json: async () => ({ revision: 2, document: request.document }) };
      }
      if (url.endsWith('/program-design')) return { ok: true, json: async () => spatialPayload };
      if (url.endsWith('/document-templates')) return { ok: true, json: async () => ({ templates: [] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Front cover' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save advanced layout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(putCount).toBe(2));
    expect(putRequests[1].mode).toBe('ADVANCED');
    expect(putRequests[1].expectedRevision).toBe(2);
    expect((putRequests[1].document as { schemaVersion?: number }).schemaVersion).toBe(2);
  });
  it('shows all named faces immediately after applying a legacy bifold template', async () => {
    const legacyBifold = adaptLegacyLayoutToDocument({
      preset: 'SINGLE_SHEET_BIFOLD',
      announcementMode: 'AFTER_PROGRAM',
      coverMode: 'NONE'
    });
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT')
        return {
          ok: true,
          json: async () => ({
            revision: 2,
            document: { layout: legacyBifold, schemaVersion: 1, sourceTemplateId: null, sourceTemplateVersion: 1 }
          })
        };
      if (url.endsWith('/program-design'))
        return { ok: true, json: async () => ({ ...advancedTemplatePayload, simpleMode: { advancedModeAvailable: false } }) };
      if (url.endsWith('/document-templates'))
        return { ok: true, json: async () => ({ templates: [{ id: 'classic-bifold', name: 'Classic Bifold', source: 'BUILT_IN' }] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.change(screen.getByLabelText('Approved template'), { target: { value: 'classic-bifold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply template' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(true)
    );
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Fold-in flap' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Front cover' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inside left' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inside right' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Back cover' })).toBeInTheDocument();

    const putCall = fetchMock.mock.calls.find(([, options]) => (options as RequestInit | undefined)?.method === 'PUT');
    expect(JSON.parse(String(putCall?.[1] && (putCall[1] as RequestInit).body)).templateId).toBe('classic-bifold');
  });
  it('applies a selected template through the Advanced Mode save path when available', async () => {
    const putBodies: Record<string, unknown>[] = [];
    const selectedTemplate = BUILT_IN_TEMPLATES.find((template) => template.key === 'classic-bifold')!;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        putBodies.push(JSON.parse(String(options.body)) as Record<string, unknown>);
        return {
          ok: true,
          json: async () => ({ revision: 2, document: { layout: normalizeToAdvanced(selectedTemplate.layout), schemaVersion: 2 } })
        };
      }
      if (url.endsWith('/document-templates'))
        return { ok: true, json: async () => ({ templates: [{ id: 'classic-bifold', name: 'Classic Bifold', source: 'BUILT_IN' }] }) };
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return { ok: true, json: async () => advancedTemplatePayload };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.change(screen.getByLabelText('Approved template'), { target: { value: 'classic-bifold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply template' }));

    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies.filter(({ templateId }) => templateId).map(({ mode, templateId }) => ({ mode, templateId }))).toEqual([
      { mode: 'ADVANCED', templateId: 'classic-bifold' }
    ]);
  });
  it('renders bi-fold panels, adds to the selected panel, and switches views', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => spatialPayload }));
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    expect(await screen.findByRole('region', { name: 'Front cover' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.change(screen.getByLabelText('Target panel'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to panel' }));
    expect(screen.getByRole('region', { name: 'Inside right' })).toHaveTextContent('Custom Text');
    const moveCustomTextUp = screen.getAllByRole('button', { name: 'Move Custom Text up' }).at(-1);
    expect(moveCustomTextUp).toBeDefined();
    expect(moveCustomTextUp).not.toBeDisabled();
    fireEvent.click(moveCustomTextUp!);
    expect(screen.getByRole('region', { name: 'Inside right' })).toHaveTextContent('Custom Text');
    fireEvent.click(screen.getByRole('button', { name: 'Phone preview' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simple Mode' })).toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Document canvas' }).querySelector('.document-root--mobile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Phone preview' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('region', { name: 'Inside right' })).toBeInTheDocument();
  });
  it('saves the selected meeting-program presentation from Advanced Mode', async () => {
    const savedDocuments: Record<string, unknown>[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        const savedDocument = JSON.parse(String(options.body)).document as Record<string, unknown>;
        savedDocuments.push(savedDocument);
        return { ok: true, json: async () => ({ revision: 2, document: { layout: savedDocument, schemaVersion: 2 } }) };
      }
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return {
        ok: true,
        json: async () => ({ ...payload, document: { ...payload.document, advancedLayout }, simpleMode: { advancedModeAvailable: true } })
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(screen.getByRole('button', { name: /^Meeting programMeeting data/ }));
    fireEvent.change(screen.getByLabelText('Agenda display'), { target: { value: 'DOTTED_LEADERS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save advanced layout' }));
    await waitFor(() => expect(savedDocuments).not.toHaveLength(0));
    const parsed = savedDocuments[0] as {
      pages: Array<{ regions: Array<{ blocks: Array<{ type: string; config: { presentation?: string } }> }> }>;
    };
    const program = parsed.pages
      .flatMap((page) => page.regions)
      .flatMap((region) => region.blocks)
      .find((block) => block.type === 'MEETING_PROGRAM');
    expect(program?.config.presentation).toBe('DOTTED_LEADERS');
  });
  it('adds, edits, reorders, removes, and saves structured announcement items', async () => {
    const savedDocuments: Record<string, unknown>[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        const savedDocument = JSON.parse(String(options.body)).document as Record<string, unknown>;
        savedDocuments.push(savedDocument);
        return { ok: true, json: async () => ({ revision: 2, document: { layout: savedDocument, schemaVersion: 2 } }) };
      }
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return {
        ok: true,
        json: async () => ({ ...payload, document: { ...payload.document, advancedLayout }, simpleMode: { advancedModeAvailable: true } })
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(screen.getByRole('button', { name: /^Add announcement list/ }));
    expect(screen.getByLabelText('Announcement display')).toHaveValue('COMPACT_ROWS');
    fireEvent.change(screen.getByLabelText('Announcement display'), { target: { value: 'DETAIL_CARDS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add announcement item' }));
    fireEvent.change(screen.getByLabelText('Title for announcement 1'), { target: { value: 'Ward dinner' } });
    fireEvent.change(screen.getByLabelText('Date for announcement 1'), { target: { value: 'Sunday, November 2' } });
    fireEvent.change(screen.getByLabelText('Time for announcement 1'), { target: { value: '6:00 PM' } });
    fireEvent.change(screen.getByLabelText('Description for announcement 1'), { target: { value: 'Bring a side dish.' } });
    fireEvent.change(screen.getByLabelText('Location for announcement 1'), { target: { value: 'Cultural hall' } });
    fireEvent.change(screen.getByLabelText('Contact for announcement 1'), { target: { value: 'Relief Society' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add announcement item' }));
    fireEvent.change(screen.getByLabelText('Title for announcement 2'), { target: { value: 'Youth service project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move announcement 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add announcement item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove announcement 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save advanced layout' }));
    await waitFor(() => expect(savedDocuments).not.toHaveLength(0));
    const parsed = savedDocuments[0] as {
      pages: Array<{
        regions: Array<{
          blocks: Array<{ type: string; config: { presentation?: string; items?: Array<{ title: string; order: number }> } }>;
        }>;
      }>;
    };
    const announcementList = parsed.pages
      .flatMap((page) => page.regions)
      .flatMap((region) => region.blocks)
      .find((block) => block.type === 'ANNOUNCEMENT_LIST');
    expect(announcementList?.config).toMatchObject({
      presentation: 'DETAIL_CARDS',
      items: [
        { title: 'Youth service project', order: 0 },
        { title: 'Ward dinner', order: 1, date: 'Sunday, November 2', time: '6:00 PM' }
      ]
    });
  });
  it('inserts, edits, orders, and saves section headings and simple lists', async () => {
    const savedDocuments: Record<string, unknown>[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        const savedDocument = JSON.parse(String(options.body)).document as Record<string, unknown>;
        savedDocuments.push(savedDocument);
        return { ok: true, json: async () => ({ revision: 2, document: { layout: savedDocument, schemaVersion: 2 } }) };
      }
      if (url.endsWith('/media')) return { ok: true, json: async () => ({ media: [] }) };
      if (url.endsWith('/reusable-blocks')) return { ok: true, json: async () => ({ blocks: [] }) };
      return {
        ok: true,
        json: async () => ({ ...payload, document: { ...payload.document, advancedLayout }, simpleMode: { advancedModeAvailable: true } })
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(screen.getByRole('button', { name: /^Add section heading/ }));
    fireEvent.change(screen.getByLabelText('Section heading title'), { target: { value: 'This week' } });
    fireEvent.change(screen.getByLabelText('Section heading subtitle'), { target: { value: 'Upcoming activities' } });
    fireEvent.change(screen.getByLabelText('Section heading display'), { target: { value: 'ACCENT' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add simple list/ }));
    expect(screen.getByLabelText('Simple list display')).toHaveValue('BULLETS');
    fireEvent.change(screen.getByLabelText('Simple list display'), { target: { value: 'NUMBERED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add list item' }));
    fireEvent.change(screen.getByLabelText('List item 1'), { target: { value: 'Food drive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add list item' }));
    fireEvent.change(screen.getByLabelText('List item 2'), { target: { value: 'Youth activity' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move list item 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save advanced layout' }));
    await waitFor(() => expect(savedDocuments).not.toHaveLength(0));
    const blocks = (
      savedDocuments[0] as { pages: Array<{ regions: Array<{ blocks: Array<{ type: string; config: Record<string, unknown> }> }> }> }
    ).pages
      .flatMap((page) => page.regions)
      .flatMap((region) => region.blocks);
    expect(blocks.find((block) => block.type === 'SECTION_HEADING')?.config).toMatchObject({
      title: 'This week',
      subtitle: 'Upcoming activities',
      presentation: 'ACCENT'
    });
    expect(blocks.find((block) => block.type === 'SIMPLE_LIST')?.config).toMatchObject({
      presentation: 'NUMBERED',
      items: [
        { text: 'Youth activity', order: 0 },
        { text: 'Food drive', order: 1 }
      ]
    });
  });

  it('disables announcement editing controls when the block content is locked', async () => {
    const lockedAnnouncementLayout = {
      ...advancedLayout,
      pages: advancedLayout.pages.map((page) => ({
        ...page,
        regions: page.regions.map((region) => ({
          ...region,
          blocks: region.blocks.map((block) =>
            block.type === 'ANNOUNCEMENTS'
              ? {
                  ...block,
                  type: 'ANNOUNCEMENT_LIST',
                  dataMode: 'MANUAL',
                  config: {
                    presentation: 'COMPACT_ROWS',
                    items: [
                      {
                        id: '22222222-2222-4222-8222-222222222222',
                        order: 0,
                        title: 'Ward dinner'
                      },
                      {
                        id: '33333333-3333-4333-8333-333333333333',
                        order: 1,
                        title: 'Family history night'
                      }
                    ]
                  },
                  lock: { level: 'BLOCK', properties: ['CONTENT'] }
                }
              : block
          )
        }))
      }))
    } as typeof advancedLayout;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...payload,
          document: { ...payload.document, layout: downgradeToV1(lockedAnnouncementLayout), advancedLayout: lockedAnnouncementLayout },
          simpleMode: { advancedModeAvailable: true }
        })
      })
    );
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Document canvas' })).getByRole('button', { name: /Announcement list/ }));
    expect(screen.getByLabelText('Announcement display')).toBeDisabled();
    expect(screen.getByLabelText('Title for announcement 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move announcement 1 down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove announcement 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add announcement item' })).toBeDisabled();
  });
  it('disables every content-editing control for locked section headings and simple lists', async () => {
    const lockedLayout = {
      ...advancedLayout,
      pages: advancedLayout.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              regions: page.regions.map((region, regionIndex) =>
                regionIndex === 0
                  ? {
                      ...region,
                      blocks: region.blocks.map((block, blockIndex) =>
                        blockIndex === 0
                          ? {
                              ...block,
                              type: 'SECTION_HEADING',
                              dataMode: 'MANUAL',
                              config: { title: 'Community', subtitle: 'This week', presentation: 'RULE' },
                              lock: { level: 'BLOCK', properties: ['CONTENT'] }
                            }
                          : blockIndex === 1
                            ? {
                                ...block,
                                type: 'SIMPLE_LIST',
                                dataMode: 'MANUAL',
                                config: {
                                  presentation: 'BULLETS',
                                  items: [
                                    { id: '22222222-2222-4222-8222-222222222222', order: 0, text: 'Food drive' },
                                    { id: '33333333-3333-4333-8333-333333333333', order: 1, text: 'Youth activity' }
                                  ]
                                },
                                lock: { level: 'BLOCK', properties: ['CONTENT'] }
                              }
                            : block
                      )
                    }
                  : region
              )
            }
          : page
      )
    } as typeof advancedLayout;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...payload,
          document: { ...payload.document, layout: downgradeToV1(lockedLayout), advancedLayout: lockedLayout },
          simpleMode: { advancedModeAvailable: true }
        })
      })
    );
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    const canvas = screen.getByRole('region', { name: 'Document canvas' });
    fireEvent.click(within(canvas).getByRole('button', { name: /Section heading/ }));
    expect(screen.getByLabelText('Section heading title')).toBeDisabled();
    expect(screen.getByLabelText('Section heading subtitle')).toBeDisabled();
    expect(screen.getByLabelText('Section heading display')).toBeDisabled();
    fireEvent.click(within(canvas).getByRole('button', { name: /Simple list/ }));
    expect(screen.getByLabelText('Simple list display')).toBeDisabled();
    expect(screen.getByLabelText('List item 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move list item 1 down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove list item 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add list item' })).toBeDisabled();
  });

  it('disables meeting-program presentation controls when the block content is locked', async () => {
    const lockedProgramLayout = {
      ...advancedLayout,
      pages: advancedLayout.pages.map((page) => ({
        ...page,
        regions: page.regions.map((region) => ({
          ...region,
          blocks: region.blocks.map((block) =>
            block.type === 'MEETING_PROGRAM' ? { ...block, lock: { level: 'BLOCK', properties: ['CONTENT'] } } : block
          )
        }))
      }))
    } as typeof advancedLayout;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...payload,
          document: { ...payload.document, layout: downgradeToV1(lockedProgramLayout), advancedLayout: lockedProgramLayout },
          simpleMode: { advancedModeAvailable: true }
        })
      })
    );
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Document canvas' })).getByRole('button', { name: /Meeting program/ }));
    expect(screen.getByLabelText('Agenda display')).toBeDisabled();
  });
  it('shows public preview errors without exposing editor controls as publish actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Desktop preview' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Preview as public visitor' }));
    await waitFor(() => expect(screen.getByRole('main')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
  });
  it('keeps advanced blocks readable but read-only in Simple Mode', async () => {
    const advancedOnlyLayout = {
      ...payload.document.layout,
      pages: payload.document.layout.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              regions: page.regions.map((region, regionIndex) =>
                regionIndex === 0
                  ? {
                      ...region,
                      blocks: region.blocks.map((block, blockIndex) =>
                        blockIndex === 0
                          ? {
                              ...block,
                              type: 'PRESIDING_CONDUCTING',
                              dataMode: 'AUTO',
                              config: { text: 'Presiding and conducting' }
                            }
                          : block
                      )
                    }
                  : region
              )
            }
          : page
      )
    };
    const advancedOnlyPayload = {
      ...payload,
      document: { ...payload.document, layout: advancedOnlyLayout },
      simpleMode: { advancedModeAvailable: false }
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => advancedOnlyPayload });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    expect(screen.getAllByText('Advanced block · read-only in Simple Mode').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Visibility')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveAttribute('readonly');
    expect(screen.getAllByRole('button', { name: /Move Presiding/i }).every((button) => button.hasAttribute('disabled'))).toBe(true);
  });
});
