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
        />
      </NextIntlClientProvider>
    );

    const wardBusinessHeading = screen.getByRole('heading', { name: 'Ward Business' });
    const membershipHeading = screen.getByRole('heading', { name: 'Membership and Ordinances' });
    const wardBusinessCard = wardBusinessHeading.closest('section');
    const membershipSection = membershipHeading.closest('section');

    expect(wardBusinessCard).toContainElement(membershipHeading);
    expect(membershipSection).toHaveClass('border-t', 'pt-4');
    expect(membershipSection).not.toHaveClass('rounded-lg');
  });
});
