// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationTimezoneSetting } from './notification-timezone';

describe('NotificationTimezoneSetting', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads timezone and saves dropdown changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ emailPreference: { frequency: 'DAILY', timezone: 'UTC' } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ emailPreference: { frequency: 'DAILY', timezone: 'America/Los_Angeles' } }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<NotificationTimezoneSetting wardId="ward-1" />);

    const select = await screen.findByRole('combobox', { name: 'Notification timezone' });
    await user.selectOptions(select, 'America/Los_Angeles');

    await waitFor(() => expect(screen.getByText('Saved')).toBeVisible());
    expect(fetchMock.mock.calls[1][0]).toBe('/api/w/ward-1/notification-subscriptions');
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ timezone: 'America/Los_Angeles' });
  });
});
