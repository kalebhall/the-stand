// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import messages from '../messages/es.json';
import { InternalNotesPanel } from './InternalNotesPanel';

describe('InternalNotesPanel localization', () => {
  afterEach(() => cleanup());

  it('renders Spanish audience controls and privacy guidance', () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <InternalNotesPanel wardId="ward-1" target={{ type: 'MEETING', meetingId: 'meeting-1' }} notes={[]} />
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agregar nota' }));
    expect(screen.getByRole('group', { name: 'Elegir audiencia de la nota' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Personal/ }));
    expect(screen.getByText('Visible solo para ti.')).toBeVisible();
    expect(screen.getByPlaceholderText('Escribir nota…')).toBeVisible();
  });
});
