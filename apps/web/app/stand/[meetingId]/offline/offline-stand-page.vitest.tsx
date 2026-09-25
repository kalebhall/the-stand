// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
const messages = MESSAGE_CATALOGS['en-US'];

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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auth.useSession.mockReset();
    offline.clearOfflineData.mockReset().mockResolvedValue(undefined);
    offline.ensureOfflineContext.mockReset().mockResolvedValue(undefined);
    offline.formatOfflineAge.mockReset().mockReturnValue('30 minutes ago');
    offline.getOfflineSnapshotAge.mockReset().mockReturnValue({ ageMs: 1_800_000, isStale: false });
    offline.getOfflineWriteEpoch.mockReset().mockReturnValue(1);
    offline.listOfflineMutations.mockReset().mockResolvedValue([]);
    offline.loadOfflineSnapshot.mockReset().mockResolvedValue(null);
    offline.queueOfflineMutation.mockReset().mockResolvedValue(undefined);
    offline.removeOfflineMutation.mockReset().mockResolvedValue(undefined);
    offline.saveOfflineSnapshot.mockReset().mockResolvedValue(undefined);
    offline.updateOfflineMutation.mockReset().mockResolvedValue(undefined);
    auth.useSession.mockReturnValue({ data: { user: { id: 'user-1' }, activeWardId: 'ward-1' } });
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

  it('rolls back a rejected business announcement and shows the localized sync error', async () => {
    const mutationId = 'mutation-rejected';
    let queuedMutation: unknown;
    const snapshot = {
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
          updatedAt: 'revision-1'
        }
      ],
      membershipActions: [],
      notes: [],
      progress: {},
      savedAt: '2026-09-20T10:00:00.000Z'
    };
    offline.loadOfflineSnapshot.mockResolvedValue(snapshot as never);
    offline.listOfflineMutations.mockImplementation(async () => (queuedMutation ? [queuedMutation] : []) as never);
    offline.queueOfflineMutation.mockImplementation(((mutation: unknown) => {
      queuedMutation = mutation;
    }) as never);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(mutationId);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [{ mutationId, status: 'rejected', error: 'FORBIDDEN' }] })
      }))
    );

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark announced' })).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Mark announced' }));
    await waitFor(() => expect(offline.queueOfflineMutation).toHaveBeenCalled());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(screen.getByText('Unable to sync offline changes.')).toBeVisible());
    expect(screen.getByRole('button', { name: 'Mark announced' })).toBeVisible();
    expect(offline.updateOfflineMutation).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'FORBIDDEN' }), 1);
    expect(offline.saveOfflineSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ businessLines: [expect.objectContaining({ id: 'line-1', status: 'pending' })] })
    );
  });

  it('renders the conflict dialog for a revision-conflicted business announcement', async () => {
    const mutationId = 'mutation-conflict';
    let queuedMutation: unknown;
    const snapshot = {
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
          updatedAt: 'revision-1'
        }
      ],
      membershipActions: [],
      notes: [],
      progress: {},
      savedAt: '2026-09-20T10:00:00.000Z'
    };
    offline.loadOfflineSnapshot.mockResolvedValue(snapshot as never);
    offline.listOfflineMutations.mockImplementation(async () => (queuedMutation ? [queuedMutation] : []) as never);
    offline.queueOfflineMutation.mockImplementation(((mutation: unknown) => {
      queuedMutation = mutation;
    }) as never);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(mutationId);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              mutationId,
              status: 'conflict',
              error: 'REVISION_CONFLICT',
              lineId: 'line-1',
              serverStatus: 'announced',
              serverRevision: 'revision-2'
            }
          ]
        })
      }))
    );

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark announced' })).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Mark announced' }));
    await waitFor(() => expect(offline.queueOfflineMutation).toHaveBeenCalled());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    expect(screen.getByText('Resolve offline conflict')).toBeVisible();
    expect(screen.getByText('Server change')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep server' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep my change' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Keep server' }));
    await waitFor(() => expect(offline.removeOfflineMutation).toHaveBeenCalledWith(mutationId, 1));
    expect(offline.saveOfflineSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ businessLines: [expect.objectContaining({ id: 'line-1', status: 'announced', updatedAt: 'revision-2' })] })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('requires confirmation and clears rendered offline state while deleting local data', async () => {
    let resolveClear: (() => void) | undefined;
    offline.loadOfflineSnapshot.mockResolvedValue({
      userId: 'user-1',
      wardId: 'ward-1',
      meeting: { id: 'meeting-1', meetingDate: '2026-09-20', meetingType: 'SACRAMENT' },
      standRows: [],
      businessLines: [],
      membershipActions: [],
      notes: [{ id: 'note-1', visibility: 'PRIVATE', noteText: 'Private note', createdAt: '2026-09-20T10:00:00.000Z' }],
      progress: {},
      savedAt: '2026-09-20T10:00:00.000Z'
    } as never);
    offline.clearOfflineData.mockImplementation(
      (() =>
        new Promise<undefined>((resolve) => {
          resolveClear = () => resolve(undefined);
        })) as never
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    renderPage();
    await waitFor(() => expect(screen.getByText('Private note')).toBeVisible());
    const deleteButton = screen.getByRole('button', { name: 'Delete offline data' });

    fireEvent.click(deleteButton);
    expect(offline.clearOfflineData).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    await waitFor(() => expect(offline.clearOfflineData).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Private note')).not.toBeInTheDocument();
    expect(screen.getByText('Loading offline copy…')).toBeVisible();

    resolveClear?.();
    await waitFor(() => expect(offline.clearOfflineData).toHaveBeenCalledTimes(1));
  });

  it('clears private rendered data when the authenticated ward context changes', async () => {
    offline.loadOfflineSnapshot.mockResolvedValue({
      userId: 'user-1',
      wardId: 'ward-1',
      meeting: { id: 'meeting-1', meetingDate: '2026-09-20', meetingType: 'SACRAMENT' },
      standRows: [],
      businessLines: [],
      membershipActions: [],
      notes: [{ id: 'note-1', visibility: 'PRIVATE', noteText: 'Private note', createdAt: '2026-09-20T10:00:00.000Z' }],
      progress: {},
      savedAt: '2026-09-20T10:00:00.000Z'
    } as never);

    const view = renderPage();
    await waitFor(() => expect(screen.getByText('Private note')).toBeVisible());

    auth.useSession.mockReturnValue({ data: { user: { id: 'user-2' }, activeWardId: 'ward-2' } });
    view.rerender(
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <OfflineStandPage meetingId="meeting-1" />
      </NextIntlClientProvider>
    );

    expect(screen.queryByText('Private note')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Private note')).not.toBeInTheDocument());
    expect(screen.getByText('Loading offline copy…')).toBeVisible();
    expect(offline.ensureOfflineContext).toHaveBeenCalledWith('user-2', 'ward-2');
  });

  it('clears an unsaved private-note draft when the authenticated context changes', async () => {
    const firstSnapshot = {
      userId: 'user-1',
      wardId: 'ward-1',
      meeting: { id: 'meeting-1', meetingDate: '2026-09-20', meetingType: 'SACRAMENT' },
      standRows: [],
      businessLines: [],
      membershipActions: [],
      notes: [],
      progress: {},
      savedAt: '2026-09-20T10:00:00.000Z'
    };
    const secondSnapshot = {
      ...firstSnapshot,
      userId: 'user-2',
      wardId: 'ward-2',
      meeting: { ...firstSnapshot.meeting, id: 'meeting-2' }
    };
    offline.loadOfflineSnapshot.mockImplementation(
      (async (requestedUserId: string) => (requestedUserId === 'user-1' ? firstSnapshot : secondSnapshot)) as never
    );

    const view = renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add note' })).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const draft = screen.getByPlaceholderText('Write a private note…');
    fireEvent.change(draft, { target: { value: 'Do not carry this draft forward' } });

    auth.useSession.mockReturnValue({ data: { user: { id: 'user-2' }, activeWardId: 'ward-2' } });
    view.rerender(
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <OfflineStandPage meetingId="meeting-2" />
      </NextIntlClientProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add note' })).toBeVisible());
    expect(screen.queryByDisplayValue('Do not carry this draft forward')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Write a private note…')).not.toBeInTheDocument();
  });

});
