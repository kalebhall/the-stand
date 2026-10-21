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
    topic: null,
    programNotes: 'Welcome to the meeting.',
    hymnNumber: null,
    hymnTitle: null,
    hymnLocale: 'en-US',
    introductionRoles: { presiding: 'Bishop Hall', conducting: 'Sister Hall', organist: '', chorister: '' },
    speakerStatus: null,
    sourceState: 'EDITABLE',
    managedHref: null
  },
  {
    id: announcementId,
    sequence: 2,
    itemType: 'ANNOUNCEMENT',
    title: 'Announcements',
    topic: null,
    programNotes: null,
    hymnNumber: null,
    hymnTitle: null,
    hymnLocale: 'en-US',
    introductionRoles: null,
    speakerStatus: null,
    sourceState: 'MANAGED',
    managedHref: '/announcements'
  },
  {
    id: speakerId,
    sequence: 3,
    itemType: 'SPEAKER',
    title: 'Jane Doe',
    topic: 'Faith in Jesus Christ',
    programNotes: null,
    hymnNumber: null,
    hymnTitle: null,
    hymnLocale: 'en-US',
    introductionRoles: null,
    speakerStatus: 'PLANNED',
    sourceState: 'EDITABLE',
    managedHref: null
  }
];

const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const renderEditor = (onSaved = vi.fn(), canEditProgramNotes = true) =>
  render(
    <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
      <ProgramEntriesEditor wardId="ward-1" meetingId="meeting-1" canEditProgramNotes={canEditProgramNotes} onSaved={onSaved} />
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
    expect(screen.getByText('Bishop Hall')).toBeInTheDocument();
    expect(screen.getByText('Sister Hall')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '3. Jane Doe' })).toHaveTextContent('Speaker topic');
    expect(screen.getByRole('article', { name: '2. Announcements' })).toHaveTextContent('Managed by Announcements');
    expect(screen.getAllByText('Program notes appear on the public program. Do not put private information here.').length).toBeGreaterThan(
      1
    );
  });

  it('shows content read-only for content editors, hides internal notes, and permits only program-note edits', async () => {
    const privateItems = items
      .map((item) => ({ ...item, notes: 'Internal introduction note' }))
      .map((item) =>
        item.id === introductionId
          ? { ...item, introductionRoles: { presiding: 'Bishop Hall', conducting: 'Sister Hall', organist: '', chorister: '' } }
          : item
      );
    const privatePayload = { ...payload, items: privateItems };
    const updatedItems = privateItems.map((item) =>
      item.id === introductionId ? { ...item, programNotes: 'Please welcome everyone.' } : item
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(privatePayload))
      .mockResolvedValueOnce(response({ itemId: introductionId, sourceRevision: nextRevision, items: updatedItems }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor(vi.fn(), true);

    const introduction = await screen.findByRole('article', { name: '1. Introduction' });
    expect(within(introduction).queryByLabelText('Title')).not.toBeInTheDocument();
    expect(within(introduction).queryByLabelText('Presiding')).not.toBeInTheDocument();
    expect(within(introduction).queryByText('Internal notes')).not.toBeInTheDocument();
    expect(introduction).not.toHaveTextContent('Internal introduction note');
    expect(within(introduction).getByText('Bishop Hall')).toBeInTheDocument();

    const programNotes = within(introduction).getByRole('textbox', { name: 'Program notes' });
    expect(programNotes).toBeEnabled();
    fireEvent.change(programNotes, { target: { value: 'Please welcome everyone.' } });
    fireEvent.click(within(introduction).getByRole('button', { name: 'Save entry' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      expectedRevision: revision,
      patch: { kind: 'TEXT', field: 'programNotes', value: 'Please welcome everyone.' }
    });
  });

  it('does not permit notes edits for a caller without program-note access', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(payload));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor(vi.fn(), false);

    const introduction = await screen.findByRole('article', { name: '1. Introduction' });
    expect(within(introduction).getByText('Bishop Hall')).toBeInTheDocument();
    expect(within(introduction).queryByRole('textbox', { name: 'Program notes' })).not.toBeInTheDocument();
    expect(within(introduction).getByText('Welcome to the meeting.')).toBeInTheDocument();
    expect(within(introduction).queryByRole('button', { name: 'Save entry' })).not.toBeInTheDocument();
  });

  it('retains a local program-note edit and rebases it after a revision conflict', async () => {
    const serverItems = items.map((item) => (item.id === introductionId ? { ...item, programNotes: 'Server-side note change' } : item));
    const savedItems = items.map((item) => (item.id === introductionId ? { ...item, programNotes: 'Local note change' } : item));
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
    const programNotes = within(introduction).getByRole('textbox', { name: 'Program notes' });
    fireEvent.change(programNotes, { target: { value: 'Local note change' } });
    fireEvent.click(within(introduction).getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('This entry changed elsewhere. Keep your local values or use the server copy.')).toBeInTheDocument();
    expect(within(introduction).getByRole('textbox', { name: 'Program notes' })).toHaveValue('Local note change');

    fireEvent.click(screen.getByRole('button', { name: 'Keep my values' }));
    fireEvent.click(within(introduction).getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, options] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      expectedRevision: nextRevision,
      patch: { kind: 'TEXT', field: 'programNotes', value: 'Local note change' }
    });
  });
});
