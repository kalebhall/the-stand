// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublicLayoutClient } from './public-layout-client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PublicLayoutClient', () => {
  const initial = {
    preset: 'FULL_PAGE',
    announcement_mode: 'AFTER_PROGRAM',
    cover_mode: 'NONE',
    cover_image_url: null,
    cover_image_alt_text: null
  };

  it('exposes labelled keyboard controls and hides image fields until selected', () => {
    render(<PublicLayoutClient wardId="ward-1" initial={initial} />);

    expect(screen.getByRole('group', { name: 'Public program layout options' })).toBeInTheDocument();
    expect(screen.getByLabelText('Preset')).toHaveValue('FULL_PAGE');
    expect(screen.getByLabelText('Announcements')).toHaveValue('AFTER_PROGRAM');
    expect(screen.getByLabelText('Cover')).toHaveValue('NONE');
    expect(screen.queryByLabelText('Image URL')).not.toBeInTheDocument();
  });

  it('shows associated cover fields and sends explicit accessible payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ layout: { ...initial, cover_mode: 'AUTHORIZED_IMAGE', cover_image_url: 'https://cdn.example.test/cover.jpg', cover_image_alt_text: 'Meetinghouse' } }), { status: 200 }));
    render(<PublicLayoutClient wardId="ward-1" initial={initial} />);

    fireEvent.change(screen.getByLabelText('Cover'), { target: { value: 'AUTHORIZED_IMAGE' } });
    fireEvent.input(screen.getByLabelText('Image URL'), { target: { value: 'https://cdn.example.test/cover.jpg' } });
    fireEvent.input(screen.getByLabelText('Image alt text'), { target: { value: 'Meetinghouse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(fetchMock).toHaveBeenCalledWith('/api/w/ward-1/public-layout', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'AUTHORIZED_IMAGE', coverImageUrl: 'https://cdn.example.test/cover.jpg', coverImageAltText: 'Meetinghouse' })
    }));
  });

  it('announces save failure without leaving button stuck', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid layout' }), { status: 400 }));
    render(<PublicLayoutClient wardId="ward-1" initial={initial} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Invalid layout'));
    expect(screen.getByRole('button', { name: 'Save layout' })).not.toBeDisabled();
  });
});
