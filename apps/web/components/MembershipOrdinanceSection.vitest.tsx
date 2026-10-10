// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
const messages = MESSAGE_CATALOGS.es;

import { MembershipOrdinanceSection, type MembershipOrdinanceAction } from './MembershipOrdinanceSection';

describe('MembershipOrdinanceSection localization', () => {
  afterEach(() => cleanup());

  it('renders Spanish controls and the official Church attendance handoff', () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <MembershipOrdinanceSection wardId="ward-1" meetingId="meeting-1" actions={[]} canManage={true} createOnly={true} />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('heading', { name: 'Membresía y ordenanzas' })).toBeVisible();
    expect(screen.getByText('Agregar acción')).toBeVisible();
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'ATTENDANCE_LCR_HANDOFF' } });
    expect(
      screen.getByText(
        'The Stand no almacena la asistencia oficial. Registra la asistencia en las herramientas de la Iglesia después de la reunión.'
      )
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Abrir guía de asistencia de la Iglesia' })).toHaveAttribute(
      'href',
      'https://www.churchofjesuschrist.org/tools/help/record-attendance'
    );
  });

  it('renders Spanish priesthood controls', () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <MembershipOrdinanceSection wardId="ward-1" meetingId="meeting-1" actions={[]} canManage={true} createOnly={true} />
      </NextIntlClientProvider>
    );

    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'PRIESTHOOD_ORDINATION' } });
    expect(screen.getByText('Oficio del sacerdocio')).toBeVisible();
    expect(screen.getByRole('option', { name: 'Diácono' })).toBeVisible();
    expect(screen.getByText('Aprobación confirmada')).toBeVisible();
    expect(screen.getByText('Líder que presenta')).toBeVisible();
  });

  it('keeps membership status actions from submitting the containing meeting form', () => {
    const action = (
      id: string,
      status: MembershipOrdinanceAction['status'],
      overrides: Partial<MembershipOrdinanceAction> = {}
    ): MembershipOrdinanceAction => ({
      id,
      member_name: 'Member Name',
      action_type: 'WELCOME_NEW_MEMBER',
      reason: null,
      details: null,
      status,
      ...overrides
    });
    const actions: MembershipOrdinanceAction[] = [
      action('interview', 'pending', { interview_status: 'needed' }),
      action('lcr', 'completed', { lcr_follow_up_status: 'needed' }),
      action('announced', 'pending'),
      action('complete', 'action_needed')
    ];

    render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <form>
          <MembershipOrdinanceSection wardId="ward-1" meetingId="meeting-1" actions={actions} canManage canCreate={false} embedded />
        </form>
      </NextIntlClientProvider>
    );

    const statusButtons = [
      screen.getByRole('button', { name: 'Interview complete' }),
      screen.getByRole('button', { name: 'Mark LCR updated' }),
      ...screen.getAllByRole('button', { name: 'Mark announced' }),
      screen.getByRole('button', { name: 'Mark completed' })
    ];
    statusButtons.forEach((button) => expect(button).toHaveProperty('type', 'button'));
  });

  it('does not render raw API errors when the error code is missing or unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Raw server error', code: 'UNKNOWN' }), { status: 400 }))
    );
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <MembershipOrdinanceSection wardId="ward-1" meetingId="meeting-1" actions={[]} canManage={true} createOnly={true} />
      </NextIntlClientProvider>
    );

    fireEvent.change(screen.getAllByPlaceholderText('Nombre')[0], { target: { value: 'Ana Pérez' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));
    expect(await screen.findByText('No se pudo agregar la acción de membresía u ordenanza.')).toBeVisible();
    expect(screen.queryByText('Raw server error')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
