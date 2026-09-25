// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';

import { TemplateGalleryClient } from './template-gallery-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const renderWithMessages = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>{ui}</NextIntlClientProvider>);

describe('TemplateGalleryClient', () => {
  it('groups built-ins and exposes copy only when authorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [
      { id: 'classic-bifold', source: 'BUILT_IN', scopeType: 'SYSTEM', name: 'Classic Bifold', description: 'Folded', status: 'PUBLISHED' }
    ] }) }));
    renderWithMessages(<TemplateGalleryClient wardId="ward-1" canCopy />);
    expect(await screen.findByText('Classic Bifold')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate and customize' })).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
  });

  it('renders a failed load as a live status and hides copy controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderWithMessages(<TemplateGalleryClient wardId="ward-1" canCopy={false} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('offline'));
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });
});
