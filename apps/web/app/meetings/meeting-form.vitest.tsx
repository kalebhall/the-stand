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

  it('keeps the Introduction expanded and lets users open and close other item details', () => {
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
        title: 'Program Speaker',
        notes: 'PRIVATE NOTES MUST NOT APPEAR IN THE SUMMARY',
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
        programNotes: '',
        hymnNumber: '',
        hymnTitle: ''
      }
    ];
    const { container } = render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <MeetingForm wardId="ward-1" mode="create" initialProgramItems={initialProgramItems} />
      </NextIntlClientProvider>
    );

    const disclosures = container.querySelectorAll<HTMLDetailsElement>('details');
    expect(disclosures).toHaveLength(3);
    expect(disclosures[0]?.open).toBe(true);
    expect(disclosures[1]?.open).toBe(false);
    expect(disclosures[2]?.open).toBe(false);
    expect(screen.getByText('Program Speaker')).toBeVisible();
    expect(screen.queryByText('PRIVATE NOTES MUST NOT APPEAR IN THE SUMMARY')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE BUSINESS PARTICIPANT')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE BUSINESS NOTES')).not.toBeInTheDocument();

    const speakerSummary = disclosures[1]?.querySelector('summary');
    expect(speakerSummary).not.toBeNull();
    if (!speakerSummary) throw new Error('speaker details disclosure is missing');
    fireEvent.click(speakerSummary);
    expect(disclosures[1]?.open).toBe(true);
    fireEvent.click(speakerSummary);
    expect(disclosures[1]?.open).toBe(false);
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
    fireEvent.click(summary);
    expect(screen.getByRole('heading', { name: 'Ward and Stake Business' })).toBeVisible();
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
