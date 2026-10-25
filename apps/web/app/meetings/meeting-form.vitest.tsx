// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
const messages = MESSAGE_CATALOGS.es;
import { MeetingForm } from './meeting-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

describe('MeetingForm localization', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders Spanish meeting workflow controls', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ members: [], hymns: [] }))));
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <MeetingForm
          wardId="ward-1"
          mode="create"
          initialMeetingDate="2026-09-20"
          initialMeetingType="SACRAMENT"
          initialProgramItems={[{ itemType: 'SPEAKER', title: '', notes: '', topic: '', programNotes: '', hymnNumber: '', hymnTitle: '' }]}
        />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Elementos del programa')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Agregar elemento' })).toBeVisible();
    expect(screen.getByText('Preparación de la reunión')).toBeVisible();
    expect(screen.getByText('Crear reunión')).toBeVisible();
  });

  it('expands a named speaker whose topic is still missing', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm
          wardId="ward-1"
          meetingId="meeting-1"
          mode="edit"
          initialProgramItems={[
            { itemType: 'SPEAKER', title: 'Assigned speaker', notes: '', topic: '', programNotes: '', hymnNumber: '', hymnTitle: '' }
          ]}
        />
      </NextIntlClientProvider>
    );

    expect(container.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
  });

  it('keeps unfilled edit entries expanded until the user closes them', () => {
    const initialProgramItems = [
      {
        itemType: 'INTRODUCTION',
        title: '',
        notes: '',
        topic: '',
        programNotes: '',
        hymnNumber: '',
        hymnTitle: '',
        introductionRoles: { presiding: 'Bishop', conducting: 'First Counselor', organist: '', chorister: '', visitingLeaders: [] }
      },
      {
        itemType: 'SPEAKER',
        title: '',
        notes: '',
        topic: '',
        programNotes: '',
        hymnNumber: '',
        hymnTitle: ''
      },
      {
        itemType: 'SPEAKER',
        title: 'Program Speaker',
        notes: 'PRIVATE NOTES MUST NOT APPEAR IN THE SUMMARY',
        topic: 'Faith',
        programNotes: '',
        hymnNumber: '',
        hymnTitle: ''
      },
      {
        itemType: 'OPENING_HYMN',
        title: '',
        notes: '',
        topic: '',
        programNotes: '',
        hymnNumber: '',
        hymnTitle: ''
      },
      {
        itemType: 'CLOSING_HYMN',
        title: '',
        notes: '',
        topic: '',
        programNotes: '',
        hymnNumber: '100',
        hymnTitle: 'Nearer, My God, to Thee'
      },
      {
        itemType: 'SACRAMENT',
        title: '',
        notes: '',
        topic: '',
        programNotes: '',
        hymnNumber: '',
        hymnTitle: ''
      },
      {
        itemType: 'TESTIMONIES',
        title: '',
        notes: '',
        topic: '',
        programNotes: '',
        hymnNumber: '',
        hymnTitle: ''
      },
      {
        itemType: 'WARD_AND_STAKE_BUSINESS',
        title: 'PRIVATE BUSINESS PARTICIPANT',
        notes: 'PRIVATE BUSINESS NOTES',
        topic: '',
        programNotes: 'Ward updates',
        hymnNumber: '',
        hymnTitle: ''
      }
    ];
    const { container } = render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm wardId="ward-1" meetingId="meeting-1" mode="edit" initialProgramItems={initialProgramItems} />
      </NextIntlClientProvider>
    );

    const disclosures = container.querySelectorAll<HTMLDetailsElement>('details');
    expect(disclosures).toHaveLength(8);
    expect(Array.from(disclosures, (disclosure) => disclosure.open)).toEqual([true, true, false, true, false, true, true, true]);
    expect(screen.queryByText('PRIVATE NOTES MUST NOT APPEAR IN THE SUMMARY')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE BUSINESS PARTICIPANT')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE BUSINESS NOTES')).not.toBeInTheDocument();

    const blankSpeakerCard = disclosures[1]?.closest('article');
    const blankSpeakerName = blankSpeakerCard?.querySelector<HTMLInputElement>('input[placeholder="Name"]');
    expect(blankSpeakerName).not.toBeNull();
    if (!blankSpeakerName) throw new Error('blank speaker name input is missing');
    fireEvent.change(blankSpeakerName, { target: { value: 'A newly assigned speaker' } });
    expect(disclosures[1]?.open).toBe(true);

    const completedSpeakerSummary = disclosures[2]?.querySelector('summary');
    expect(completedSpeakerSummary).not.toBeNull();
    if (!completedSpeakerSummary) throw new Error('completed speaker summary is missing');
    fireEvent.click(completedSpeakerSummary);
    expect(disclosures[2]?.open).toBe(true);
    fireEvent.click(completedSpeakerSummary);
    expect(disclosures[2]?.open).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const expandedDetails = container.querySelectorAll<HTMLDetailsElement>('details');
    expect(expandedDetails[expandedDetails.length - 1]?.open).toBe(true);
  });

  it('keeps newly added empty announcement and business sections collapsed', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm
          wardId="ward-1"
          mode="create"
          initialProgramItems={[
            { itemType: 'SPEAKER', title: 'Existing speaker', notes: '', topic: '', programNotes: '', hymnNumber: '', hymnTitle: '' }
          ]}
        />
      </NextIntlClientProvider>
    );
    const typeSelect = screen.getAllByRole('combobox')[1];
    if (!typeSelect) throw new Error('program item type selector is missing');
    const addButton = screen.getByRole('button', { name: 'Add item' });

    fireEvent.change(typeSelect, { target: { value: 'ANNOUNCEMENT' } });
    fireEvent.click(addButton);
    let disclosures = container.querySelectorAll<HTMLDetailsElement>('details');
    expect(disclosures[1]?.open).toBe(false);

    fireEvent.change(typeSelect, { target: { value: 'WARD_AND_STAKE_BUSINESS' } });
    fireEvent.click(addButton);
    disclosures = container.querySelectorAll<HTMLDetailsElement>('details');
    expect(disclosures[2]?.open).toBe(false);
  });

  it('keeps empty announcement and business sections collapsed until they have content', () => {
    const initialProgramItems = [
      { itemType: 'ANNOUNCEMENT', title: '', notes: '', topic: '', programNotes: '', hymnNumber: '', hymnTitle: '' },
      {
        itemType: 'WARD_AND_STAKE_BUSINESS',
        title: 'PRIVATE BUSINESS PARTICIPANT',
        notes: 'PRIVATE BUSINESS NOTES',
        topic: 'PRIVATE PARTICIPANT CALLING',
        programNotes: '',
        hymnNumber: '',
        hymnTitle: ''
      }
    ];
    const emptyView = render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm wardId="ward-1" meetingId="meeting-1" mode="edit" initialProgramItems={initialProgramItems} />
      </NextIntlClientProvider>
    );

    expect(Array.from(emptyView.container.querySelectorAll<HTMLDetailsElement>('details'), (details) => details.open)).toEqual([
      false,
      false
    ]);
    emptyView.unmount();

    const populatedItems = initialProgramItems.map((item) =>
      item.itemType === 'WARD_AND_STAKE_BUSINESS' ? { ...item, programNotes: 'Ward meeting updates' } : item
    );
    const populatedView = render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm
          wardId="ward-1"
          meetingId="meeting-1"
          mode="edit"
          initialProgramItems={populatedItems}
          standAnnouncements={[{ title: 'Stake conference', body: 'Next month' }]}
        />
      </NextIntlClientProvider>
    );

    expect(Array.from(populatedView.container.querySelectorAll<HTMLDetailsElement>('details'), (details) => details.open)).toEqual([
      true,
      true
    ]);
  });

  it('expands an announcement item with public program notes', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm
          wardId="ward-1"
          meetingId="meeting-1"
          mode="edit"
          initialProgramItems={[
            {
              itemType: 'ANNOUNCEMENT',
              title: '',
              notes: '',
              topic: '',
              programNotes: 'Public announcement details',
              hymnNumber: '',
              hymnTitle: ''
            }
          ]}
        />
      </NextIntlClientProvider>
    );

    expect(container.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
  });

  it('keeps the Ward and Stake Business title during meeting creation', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm
          wardId="ward-1"
          mode="create"
          initialProgramItems={[
            { itemType: 'WARD_AND_STAKE_BUSINESS', title: '', notes: '', topic: '', programNotes: '', hymnNumber: '', hymnTitle: '' }
          ]}
        />
      </NextIntlClientProvider>
    );

    const itemHeading = screen.getByRole('heading', { name: /ward and stake business/i, level: 3 });
    const disclosure = itemHeading.closest('article')?.querySelector('details');
    const summary = disclosure?.querySelector('summary');
    expect(summary).not.toBeNull();
    if (!summary) throw new Error('business details disclosure is missing');
    expect(disclosure?.open).toBe(false);
    fireEvent.click(summary);
    expect(disclosure?.open).toBe(true);
    expect(screen.getByRole('heading', { name: 'Ward and Stake Business', level: 2 })).toBeVisible();
  });

  it('expands a selected stake business entry while participant details are incomplete', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm
          wardId="ward-1"
          meetingId="meeting-1"
          mode="edit"
          initialProgramItems={[
            {
              itemType: 'WARD_AND_STAKE_BUSINESS',
              title: '',
              notes: '[STAKE_BUSINESS]',
              topic: '',
              programNotes: '',
              hymnNumber: '',
              hymnTitle: ''
            }
          ]}
        />
      </NextIntlClientProvider>
    );

    expect(container.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
  });

  it('shows stake participant fields only when stake business is checked, after the checkbox', () => {
    const initialProgramItems = [
      {
        itemType: 'WARD_AND_STAKE_BUSINESS',
        title: 'Stake president',
        notes: '',
        topic: 'Stake president calling',
        programNotes: '',
        hymnNumber: '',
        hymnTitle: ''
      }
    ];
    render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm wardId="ward-1" meetingId="meeting-1" mode="edit" initialProgramItems={initialProgramItems} />
      </NextIntlClientProvider>
    );

    const businessHeading = screen.getByRole('heading', { name: /ward and stake business/i });
    const businessDisclosure = businessHeading.closest('article')?.querySelector('details');
    const businessSummary = businessDisclosure?.querySelector('summary');
    expect(businessSummary).not.toBeNull();
    if (!businessSummary) throw new Error('business details disclosure is missing');
    fireEvent.click(businessSummary);

    const stakeBusinessCheckbox = screen.getByRole('checkbox', { name: 'Includes stake business' });
    expect(screen.queryByLabelText('Stake business participant')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Participant calling')).not.toBeInTheDocument();

    fireEvent.click(stakeBusinessCheckbox);

    const participant = screen.getByLabelText('Stake business participant');
    const calling = screen.getByLabelText('Participant calling');
    expect(stakeBusinessCheckbox.compareDocumentPosition(participant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(participant).toHaveValue('Stake president');
    expect(calling).toHaveValue('Stake president calling');
  });

  it('places the membership and ordinances workflow inside the Ward Business card', () => {
    const initialProgramItems = [
      { itemType: 'WARD_AND_STAKE_BUSINESS', title: '', notes: '', topic: '', programNotes: '', hymnNumber: '', hymnTitle: '' }
    ];
    render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm
          wardId="ward-1"
          meetingId="meeting-1"
          mode="edit"
          initialProgramItems={initialProgramItems}
          membershipActions={[]}
          canManageMembership
          canViewCallingsWorkspace
        />
      </NextIntlClientProvider>
    );

    const businessHeading = screen.getByRole('heading', { name: /ward and stake business/i });
    const businessDisclosure = businessHeading.closest('article')?.querySelector('details');
    const businessSummary = businessDisclosure?.querySelector('summary');
    expect(businessSummary).not.toBeNull();
    if (!businessSummary) throw new Error('business details disclosure is missing');
    fireEvent.click(businessSummary);

    const wardBusinessHeading = screen.getByRole('heading', { name: 'Ward Business' });
    const wardBusinessCard = wardBusinessHeading.closest('section');
    const membershipSection = screen.getByText('No membership or ordinance actions added.').closest('section');
    const membershipLink = screen.getByRole('link', { name: 'Open Membership and Ordinances' });
    const callingsLink = screen.getByRole('link', { name: 'Open Callings' });

    expect(wardBusinessCard).toContainElement(membershipLink);
    expect(wardBusinessCard).toContainElement(callingsLink);
    expect(wardBusinessCard).toContainElement(membershipSection);
    expect(membershipLink).toHaveAttribute('href', '/membership-ordinances');
    expect(callingsLink).toHaveAttribute('href', '/callings');
    expect(membershipSection).toHaveClass('space-y-4');
    expect(membershipSection).not.toHaveClass('rounded-lg');
    expect(screen.queryByRole('heading', { name: 'Membership and Ordinances' })).not.toBeInTheDocument();
    expect(screen.queryByText('Welcome, blessing, and priesthood actions for this meeting.')).not.toBeInTheDocument();
  });
});
