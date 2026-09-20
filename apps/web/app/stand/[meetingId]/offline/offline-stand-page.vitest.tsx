// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/en-US.json';

const auth = vi.hoisted(() => ({ useSession: vi.fn() }));
const offline = vi.hoisted(() => ({
  clearOfflineData: vi.fn(async () => undefined),
  ensureOfflineContext: vi.fn(async () => undefined),
  formatOfflineAge: vi.fn(() => '30 minutes ago'),
  getOfflineSnapshotAge: vi.fn(() => ({ ageMs: 1_800_000, isStale: false })),
  getOfflineWriteEpoch: vi.fn(() => 1),
  listOfflineMutations: vi.fn(async () => []),
  loadOfflineSnapshot: vi.fn(async () => null),
  queueOfflineMutation: vi.fn(async () => undefined),
  removeOfflineMutation: vi.fn(async () => undefined),
  saveOfflineSnapshot: vi.fn(async () => undefined),
  updateOfflineMutation: vi.fn(async () => undefined)
}));

vi.mock('next-auth/react', () => auth);
vi.mock('@/src/offline/storage', () => offline);

import OfflineStandPage from './offline-stand-page';

describe('OfflineStandPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    auth.useSession.mockReturnValue({ data: { user: { id: 'user-1' }, activeWardId: 'ward-1' } });
    offline.ensureOfflineContext.mockResolvedValue(undefined);
    offline.loadOfflineSnapshot.mockResolvedValue(null);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  const renderPage = () =>
    render(
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <OfflineStandPage meetingId="meeting-1" />
      </NextIntlClientProvider>
    );

  it('renders a translated loading state before an authorized snapshot is available', () => {
    renderPage();

    expect(screen.getByText('Loading offline copy…')).toBeVisible();
  });

  it('renders the localized error state when the offline context cannot be opened', async () => {
    offline.ensureOfflineContext.mockRejectedValueOnce(new Error('permission denied'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Unable to open offline copy.')).toBeVisible());
    expect(screen.queryByText('Loading offline copy…')).not.toBeInTheDocument();
  });

  it('renders cached membership actions read-only and keeps business controls separate', async () => {
    offline.loadOfflineSnapshot.mockResolvedValue({
      userId: 'user-1',
      wardId: 'ward-1',
      meeting: { id: 'meeting-1', meetingDate: '2026-09-20', meetingType: 'SACRAMENT' },
      standRows: [],
      businessLines: [
        {
          id: 'line-1',
          memberName: 'Sister Jane Smith',
          callingName: 'Relief Society President',
          actionType: 'SUSTAIN',
          status: 'pending',
          updatedAt: '2026-09-19T12:00:00.000Z'
        }
      ],
      membershipActions: [{ id: 'action-1', memberName: 'Brother John Smith', actionType: 'BABY_BLESSING', status: 'pending' }],
      notes: [],
      progress: {},
      savedAt: '2026-09-20T10:00:00.000Z'
    } as never);

    renderPage();

    await waitFor(() => expect(screen.getByText('Brother John Smith')).toBeVisible());
    expect(screen.getByText('Membership and ordinance items are read-only here. Use connected meeting management to change them.')).toBeVisible();
    expect(screen.getByText('Baby blessing').closest('li')).not.toHaveTextContent('Mark announced');
    expect(screen.getByText(/Sister Jane Smith/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mark announced' })).toBeVisible();
  });
});
