// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from './notification-center';

const notification = { id: 'n-1', eventType: 'CALLING_SUGGESTED', title: 'Calling suggested', summary: 'Calling suggested: Bishop', details: { callingName: 'Bishop' }, severity: 'info', targetUrl: '/callings/c-1', readAt: null, createdAt: new Date().toISOString() };

describe('NotificationCenter', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('loads unread notifications, expands details, and marks opened item read', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [notification], unreadCount: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationCenter wardId="ward-1" />);

    expect(await screen.findByRole('button', { name: 'Calling suggested' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Calling suggested' }));
    expect(screen.getByText(/calling name:/i)).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/w/ward-1/notifications/n-1', expect.objectContaining({ method: 'PATCH' })));
    expect(screen.getByRole('link', { name: 'Open related item' })).toHaveAttribute('href', '/callings/c-1');
  });

  it('marks all read and removes dismissed notifications', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [notification], unreadCount: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, markedCount: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationCenter wardId="ward-1" />);

    await screen.findByText('Calling suggested');
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByText('0 unread')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dismiss Calling suggested' }));
    await waitFor(() => expect(screen.getByText('No notifications')).toBeVisible());
  });
});
