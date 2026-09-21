// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';
import { ProgramDesignerClient } from './program-designer-client';

const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const payload = {
  document: { id: 'document-1', layout, theme: layout.theme, revision: 1, sourceTemplateId: null, sourceTemplateVersion: null },
  previewSource: { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward', programItems: [] }
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ProgramDesignerClient', () => {
  it('loads without issuing an initial save and exposes accessible editor regions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    render(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    expect(await screen.findByRole('region', { name: 'Document canvas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Approved blocks' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Simple Mode properties' })).toBeInTheDocument();
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
    render(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'HIDDEN' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'PUT')).toBe(true), { timeout: 1200 });
    const putCall = fetchMock.mock.calls.find(([, options]) => (options as RequestInit | undefined)?.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(JSON.parse(String(putCall?.[1] && (putCall[1] as RequestInit).body)).expectedRevision).toBe(1);
  });
  it('shows public preview errors without exposing editor controls as publish actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    render(<ProgramDesignerClient wardId="ward-1" meetingId="meeting-1" />);
    await screen.findByRole('region', { name: 'Document canvas' });
    fireEvent.click(screen.getByRole('button', { name: 'Desktop preview' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Preview as public visitor' }));
    await waitFor(() => expect(screen.getByRole('main')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
  });
});
