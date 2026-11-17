// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';

import { ProgramsClient } from './programs-client';
import { TemplateGalleryClient } from './templates/template-gallery-client';

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

describe('ProgramsClient', () => {
  it('shows upcoming meeting status and preview action when editable', () => {
    renderWithMessages(
      <ProgramsClient
        meetings={[{ id: 'meeting-1', meetingDate: '2026-01-04', meetingType: 'SACRAMENT', status: 'DRAFT', programItemCount: 3 }]}
      />
    );
    expect(screen.getByText('2026-01-04')).toBeTruthy();
    expect(screen.getByText('Preview current program')).toBeTruthy();
  });

  it('renders the read-only upcoming layout without designer or preview actions', () => {
    renderWithMessages(
      <ProgramsClient
        readOnly
        meetings={[
          {
            id: 'meeting-2',
            meetingDate: '2026-01-11',
            meetingType: 'SACRAMENT',
            status: 'DRAFT',
            programItemCount: 2,
            programItems: ['Opening hymn', 'Closing prayer']
          }
        ]}
      />
    );
    expect(screen.getByText('Read only')).toBeTruthy();
    expect(screen.getByText('Opening hymn')).toBeTruthy();
    expect(screen.getByText('Closing prayer')).toBeTruthy();
    expect(screen.queryByText('Open Program Designer')).toBeNull();
    expect(screen.queryByText('Preview current program')).toBeNull();
  });
});

describe('TemplateGalleryClient', () => {
  it('loads built-ins and hides copy for read-only users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          templates: [
            {
              id: 'classic-bifold',
              source: 'BUILT_IN',
              scopeType: 'SYSTEM',
              name: 'Classic Bifold',
              description: 'Classic',
              status: 'PUBLISHED'
            }
          ]
        })
      })
    );
    renderWithMessages(<TemplateGalleryClient wardId="ward-1" canCopy={false} />);
    await waitFor(() => expect(screen.getByText('Classic Bifold')).toBeTruthy());
    expect(screen.queryByText('Copy to ward draft')).toBeNull();
  });

  it('copies a template and reports success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            templates: [{ id: 'classic-bifold', source: 'BUILT_IN', scopeType: 'SYSTEM', name: 'Classic Bifold', status: 'PUBLISHED' }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ template: { id: 'ward-copy', name: 'Classic Bifold Copy', status: 'DRAFT' } })
        })
    );
    renderWithMessages(<TemplateGalleryClient wardId="ward-1" canCopy />);
    await waitFor(() => expect(screen.getByText('Copy to ward draft')).toBeTruthy());
    screen.getByText('Copy to ward draft').click();
    await waitFor(() => expect(screen.getByText('Template copied to Ward Templates.')).toBeTruthy());
  });
});
