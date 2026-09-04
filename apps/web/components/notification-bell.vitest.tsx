// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationBell } from './notification-bell';

describe('NotificationBell', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('links to notifications and shows unread badge after background fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ unreadCount: 4 }), { status: 200 })));
    render(<NotificationBell wardId="ward-1" />);

    const link = screen.getByRole('link', { name: 'Notifications' });
    expect(link).toHaveAttribute('href', '/notifications');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications, 4 unread' })).toBeVisible());
    expect(screen.getByText('4')).toBeVisible();
  });

  it('does not fetch or render badge without active ward', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<NotificationBell wardId={null} />);

    expect(screen.getByRole('link', { name: 'Notifications' })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
