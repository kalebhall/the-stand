// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationSubscriptionSettings } from './notification-subscription-settings';

const subscriptions = [
  { eventType: 'CALLING_SUGGESTED' as const, category: 'CALLINGS' as const, label: 'Calling suggested', channels: { IN_APP: true, EMAIL: false } },
  { eventType: 'MEMBER_UPDATED' as const, category: 'MEMBERSHIP' as const, label: 'Member information updated', channels: { IN_APP: true, EMAIL: true } }
];

describe('NotificationSubscriptionSettings', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('loads grouped channel controls and warns when email is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ subscriptions }), { status: 200 })));
    render(<NotificationSubscriptionSettings wardId="ward-1" hasUsableEmail={false} />);

    expect(await screen.findByText('Callings')).toBeVisible();
    expect(screen.getByText(/email notifications are unavailable/i)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Calling suggested In-app' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Calling suggested Email' })).toBeDisabled();
  });

  it('saves both channel values as one batch and shows saved state', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ subscriptions, emailPreference: { frequency: 'IMMEDIATE', timezone: 'UTC' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ subscriptions, emailPreference: { frequency: 'DAILY', timezone: 'America/Los_Angeles' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationSubscriptionSettings wardId="ward-1" hasUsableEmail={true} />);

    await screen.findByText('Callings');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Email frequency' }), 'DAILY');
    await user.clear(screen.getByRole('textbox', { name: 'Email timezone' }));
    await user.type(screen.getByRole('textbox', { name: 'Email timezone' }), 'America/Los_Angeles');
    await user.click(screen.getByRole('checkbox', { name: 'Calling suggested In-app' }));
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(screen.getByText('Saved')).toBeVisible());
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe('/api/w/ward-1/notification-subscriptions');
    const body = JSON.parse((request[1] as RequestInit).body as string) as { subscriptions: Array<{ eventType: string; channel: string; enabled: boolean }>; emailPreference: { frequency: string; timezone: string } };
    expect(body.subscriptions).toHaveLength(4);
    expect(body.subscriptions.find((item) => item.eventType === 'CALLING_SUGGESTED' && item.channel === 'IN_APP')?.enabled).toBe(false);
    expect(body.emailPreference).toEqual({ frequency: 'DAILY', timezone: 'America/Los_Angeles' });
  });
});
