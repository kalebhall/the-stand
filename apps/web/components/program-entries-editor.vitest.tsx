// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
import type { EditorProgramItem, ProgramItemsResponse } from '@/src/meetings/program-item-contracts';
import { ProgramEntriesEditor } from './program-entries-editor';

const introductionId = '00000000-0000-0000-0000-000000000001';
const speakerId = '00000000-0000-0000-0000-000000000003';
const announcementId = '00000000-0000-0000-0000-000000000002';
const revision = `sr1_${'a'.repeat(64)}`;
const nextRevision = `sr1_${'b'.repeat(64)}`;

const items: EditorProgramItem[] = [
  {
    id: introductionId,
    sequence: 1,
    itemType: 'INTRODUCTION',
    title: 'Introduction',
    notes: 'Internal introduction note',
    topic: null,
    programNotes: 'Welcome to the meeting.',
    hymnNumber: null,
    hymnTitle: null,
    hymnLocale: 'en-US',
    introductionRoles: { presiding: '', conducting: '', organist: '', chorister: '' },
    speakerStatus: null,
    sourceState: 'EDITABLE',
    managedHref: null,
    internalNotesEditable: true
  },
  {
    id: announcementId,
    sequence: 2,
    itemType: 'ANNOUNCEMENT',
    title: 'Announcements',
    notes: null,
    topic: null,
    programNotes: null,
    hymnNumber: null,
    hymnTitle: null,
    hymnLocale: 'en-US',
    introductionRoles: null,
    speakerStatus: null,
    sourceState: 'MANAGED',
    managedHref: '/announcements',
    internalNotesEditable: false
  },
  {
    id: speakerId,
    sequence: 3,
    itemType: 'SPEAKER',
    title: 'Jane Doe',
    notes: null,
    topic: 'Faith in Jesus Christ',
    programNotes: null,
    hymnNumber: null,
    hymnTitle: null,
    hymnLocale: 'en-US',
    introductionRoles: null,
    speakerStatus: 'PLANNED',
    sourceState: 'EDITABLE',
    managedHref: null,
    internalNotesEditable: true
  }
];

const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const renderEditor = (onSaved = vi.fn()) =>
  render(
    <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
      <ProgramEntriesEditor wardId="ward-1" meetingId="meeting-1" onSaved={onSaved} />
    </NextIntlClientProvider>
  );

const payload: ProgramItemsResponse = {
  meeting: { id: '00000000-0000-0000-0000-000000000010', meetingDate: '2026-09-20', meetingType: 'SACRAMENT' },
  sourceRevision: revision,
  items
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProgramEntriesEditor', () => {
  it('renders every source row with Introduction role fields and managed-state guidance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(payload));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'Program content' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ cache: 'no-store' });
    expect(screen.getByRole('article', { name: '1. Introduction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Presiding')).toBeInTheDocument();
    expect(screen.getByLabelText('Conducting')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '3. Jane Doe' })).toHaveTextContent('Speaker topic');
    expect(screen.getByRole('article', { name: '2. Announcements' })).toHaveTextContent('Managed by Announcements');
    expect(screen.getAllByText('Program notes appear on the public program. Do not put private information here.').length).toBeGreaterThan(
      1
    );
  });

  it('saves a changed Introduction role with the current opaque revision', async () => {
    const updatedItems = items.map((item) =>
      item.id === introductionId ? { ...item, introductionRoles: { ...item.introductionRoles!, presiding: 'Bishop Hall' } } : item
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(payload))
      .mockResolvedValueOnce(response({ itemId: introductionId, sourceRevision: nextRevision, items: updatedItems }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    const introduction = await screen.findByRole('article', { name: '1. Introduction' });
    fireEvent.change(within(introduction).getByLabelText('Presiding'), { target: { value: 'Bishop Hall' } });
    fireEvent.click(within(introduction).getByRole('button', { name: 'Save entry' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      expectedRevision: revision,
      patch: { kind: 'INTRODUCTION_ROLE', role: 'presiding', value: 'Bishop Hall' }
    });
  });

  it('keeps later local field edits after an earlier patch succeeds and a later patch fails', async () => {
    const firstSavedItems = items.map((item) =>
      item.id === introductionId ? { ...item, introductionRoles: { ...item.introductionRoles!, presiding: 'Bishop Hall' } } : item
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(payload))
      .mockResolvedValueOnce(response({ itemId: introductionId, sourceRevision: nextRevision, items: firstSavedItems }))
      .mockResolvedValueOnce(response({ error: 'Second patch failed' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    const introduction = await screen.findByRole('article', { name: '1. Introduction' });
    fireEvent.change(within(introduction).getByLabelText('Presiding'), { target: { value: 'Bishop Hall' } });
    fireEvent.change(within(introduction).getByLabelText('Conducting'), { target: { value: 'Counselor Hall' } });
    fireEvent.click(within(introduction).getByRole('button', { name: 'Save entry' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(within(introduction).getByLabelText('Presiding')).toHaveValue('Bishop Hall');
    expect(within(introduction).getByLabelText('Conducting')).toHaveValue('Counselor Hall');
  });

  it('retains local values and rebases them after a revision conflict', async () => {
    const serverItems = items.map((item) =>
      item.id === introductionId ? { ...item, introductionRoles: { ...item.introductionRoles!, presiding: 'Another Bishop' } } : item
    );
    const savedItems = items.map((item) =>
      item.id === introductionId ? { ...item, introductionRoles: { ...item.introductionRoles!, presiding: 'Bishop Hall' } } : item
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(payload))
      .mockResolvedValueOnce(
        response(
          { error: 'Conflict', code: 'REVISION_CONFLICT', current: { ...payload, sourceRevision: nextRevision, items: serverItems } },
          409
        )
      )
      .mockResolvedValueOnce(response({ itemId: introductionId, sourceRevision: `sr1_${'c'.repeat(64)}`, items: savedItems }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    const introduction = await screen.findByRole('article', { name: '1. Introduction' });
    fireEvent.change(within(introduction).getByLabelText('Presiding'), { target: { value: 'Bishop Hall' } });
    fireEvent.click(within(introduction).getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('This entry changed elsewhere. Keep your local values or use the server copy.')).toBeInTheDocument();
    expect(within(introduction).getByLabelText('Presiding')).toHaveValue('Bishop Hall');

    fireEvent.click(screen.getByRole('button', { name: 'Keep my values' }));
    fireEvent.click(within(introduction).getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, options] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      expectedRevision: nextRevision,
      patch: { kind: 'INTRODUCTION_ROLE', role: 'presiding', value: 'Bishop Hall' }
    });
  });
});
