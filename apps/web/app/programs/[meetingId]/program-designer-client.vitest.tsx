// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';

import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';
import { ProgramDesignerClient } from './program-designer-client';

const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const payload = {
  document: { id: 'document-1', layout, theme: layout.theme, revision: 1, sourceTemplateId: null, sourceTemplateVersion: null },
  previewSource: { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward', programItems: [] }
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

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const renderWithMessages = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>{ui}</NextIntlClientProvider>);

describe('ProgramDesignerClient', () => {
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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockResolvedValue({ ok: true, json: async () => ({ revision: 2, document: { ...payload.document, layout: payload.document.layout, revision: 2 } }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'HIDDEN' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(true), { timeout: 1200 });
    const putCall = fetchMock.mock.calls.find(([, options]) => (options as RequestInit | undefined)?.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(JSON.parse(String(putCall?.[1] && (putCall[1] as RequestInit).body)).expectedRevision).toBe(1);
  });
  it('queues the latest advanced draft while a save is in flight', async () => {
    let putCount = 0;
    const putDocuments: unknown[] = [];
    let resolveFirst: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        putCount += 1;
        const request = JSON.parse(String(options.body)) as { document: unknown };
        putDocuments.push(request.document);
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
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });
  it('retries a failed advanced save with the advanced payload', async () => {
    let putCount = 0;
    const putRequests: Array<{ mode: string; document: unknown }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT') {
        putCount += 1;
        const request = JSON.parse(String(options.body)) as { mode: string; document: unknown };
        putRequests.push(request);
        if (putCount === 1) return { ok: false, json: async () => ({ error: 'offline' }) };
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
    expect((putRequests[1].document as { schemaVersion?: number }).schemaVersion).toBe(2);
  });
  it('shows all named faces immediately after applying a legacy bifold template', async () => {
    const legacyBifold = adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/program-design') && options?.method === 'PUT')
        return {
          ok: true,
          json: async () => ({ revision: 2, document: { layout: legacyBifold, schemaVersion: 1, sourceTemplateId: null, sourceTemplateVersion: 1 } })
        };
      if (url.endsWith('/program-design')) return { ok: true, json: async () => advancedTemplatePayload };
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
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Fold-in flap' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Front cover' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inside left' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inside right' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Back cover' })).toBeInTheDocument();

    const putCall = fetchMock.mock.calls.find(([, options]) => (options as RequestInit | undefined)?.method === 'PUT');
    expect(JSON.parse(String(putCall?.[1] && (putCall[1] as RequestInit).body)).templateId).toBe('classic-bifold');
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
    expect(screen.getByRole('button', { name: 'Phone preview' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('region', { name: 'Inside right' })).toBeInTheDocument();
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
});
