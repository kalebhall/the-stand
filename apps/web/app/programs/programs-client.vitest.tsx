// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { ProgramsClient } from './programs-client';
import { TemplateGalleryClient } from './templates/template-gallery-client';

afterEach(() => vi.restoreAllMocks());

describe('ProgramsClient', () => {
  it('shows upcoming meeting status and preview action', () => {
    render(<ProgramsClient meetings={[{ id: 'meeting-1', meetingDate: '2026-01-04', meetingType: 'SACRAMENT', status: 'DRAFT', programItemCount: 3 }]} />);
    expect(screen.getByText('2026-01-04')).toBeTruthy();
    expect(screen.getByText('Preview current program')).toBeTruthy();
  });
});

describe('TemplateGalleryClient', () => {
  it('loads built-ins and hides copy for read-only users', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [{ id: 'classic-bifold', source: 'BUILT_IN', scopeType: 'SYSTEM', name: 'Classic Bifold', description: 'Classic', status: 'PUBLISHED' }] }) }));
    render(<TemplateGalleryClient wardId="ward-1" canCopy={false} />);
    await waitFor(() => expect(screen.getByText('Classic Bifold')).toBeTruthy());
    expect(screen.queryByText('Copy to ward draft')).toBeNull();
  });

  it('copies a template and reports success', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ templates: [{ id: 'classic-bifold', source: 'BUILT_IN', scopeType: 'SYSTEM', name: 'Classic Bifold', status: 'PUBLISHED' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ template: { id: 'ward-copy', name: 'Classic Bifold Copy', status: 'DRAFT' } }) }));
    render(<TemplateGalleryClient wardId="ward-1" canCopy />);
    await waitFor(() => expect(screen.getByText('Copy to ward draft')).toBeTruthy());
    screen.getByText('Copy to ward draft').click();
    await waitFor(() => expect(screen.getByText('Template copied to Ward Templates.')).toBeTruthy());
  });
});
