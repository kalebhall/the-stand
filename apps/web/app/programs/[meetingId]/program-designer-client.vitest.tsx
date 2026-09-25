// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';

import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';
import { normalizeToAdvanced } from '@/src/document-designer/advanced-schema';
import { ProgramDesignerClient } from './program-designer-client';

const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const payload = {
  document: { id: 'document-1', layout, theme: layout.theme, revision: 1, sourceTemplateId: null, sourceTemplateVersion: null },
  previewSource: { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward', programItems: [] }
};
const spatialLayout = adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const spatialAdvancedLayout = normalizeToAdvanced(spatialLayout);
const spatialPayload = {
  ...payload,
  document: { ...payload.document, layout: spatialLayout, advancedLayout: spatialAdvancedLayout },
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
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/w/ward-1/meetings/meeting-1/program-design',
      '/api/w/ward-1/document-templates',
      '/api/w/ward-1/media'
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
  it('renders bi-fold panels, adds to the selected panel, and switches views', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => spatialPayload }));
    renderWithMessages(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    expect(await screen.findByRole('region', { name: 'Front cover' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Mode' }));
    fireEvent.change(screen.getByLabelText('Target panel'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to panel' }));
    expect(screen.getByRole('region', { name: 'Inside right' })).toHaveTextContent('Custom Text');
    fireEvent.click(screen.getByRole('button', { name: 'Phone preview' }));
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
