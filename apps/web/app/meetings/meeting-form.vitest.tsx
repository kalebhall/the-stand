// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
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
});
