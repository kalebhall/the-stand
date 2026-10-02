// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';

import { TemplateDetailClient } from './template-detail-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const renderWithMessages = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>{ui}</NextIntlClientProvider>);

describe('TemplateDetailClient', () => {
  it('renders the approved thumbnail and falls back when it fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ template: { name: 'Classic Bifold', description: 'Folded', scopeType: 'SYSTEM', source: 'BUILT_IN', status: 'PUBLISHED', thumbnail: '/program-templates/classic-bifold.svg' } }) }));
    renderWithMessages(<TemplateDetailClient wardId="ward-1" templateId="classic-bifold" canCopy={false} />);
    const preview = await screen.findByRole('img', { name: 'Classic Bifold Template preview' });
    expect(preview).toHaveAttribute('src', '/program-templates/classic-bifold.svg');
    fireEvent.error(preview);
    expect(screen.getByText('Template preview')).toBeInTheDocument();
  });

  it('rejects an external thumbnail and uses the localized paper fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ template: { name: 'Unsafe', description: null, scopeType: 'WARD', source: 'WARD', status: 'PUBLISHED', thumbnail: 'https://example.com/unsafe.svg' } }) }));
    renderWithMessages(<TemplateDetailClient wardId="ward-1" templateId="unsafe" canCopy={false} />);
    expect(await screen.findByText('Template preview')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getAllByText('Ward Templates').length).toBeGreaterThan(0);
  });

  it('clears a prior thumbnail failure when loading another template', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ template: { name: 'Broken', description: null, scopeType: 'WARD', source: 'WARD', status: 'PUBLISHED', thumbnail: '/program-templates/broken.svg' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ template: { name: 'Working', description: null, scopeType: 'WARD', source: 'WARD', status: 'PUBLISHED', thumbnail: '/program-templates/working.svg' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWithMessages(<TemplateDetailClient wardId="ward-1" templateId="broken" canCopy={false} />);
    const brokenPreview = await view.findByRole('img', { name: 'Broken Template preview' });
    fireEvent.error(brokenPreview);
    view.rerender(<NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}><TemplateDetailClient wardId="ward-1" templateId="working" canCopy={false} /></NextIntlClientProvider>);
    expect(await screen.findByRole('img', { name: 'Working Template preview' })).toHaveAttribute('src', '/program-templates/working.svg');
  });
});
