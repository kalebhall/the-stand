// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../messages/es.json';
import { HymnAutocomplete } from './HymnAutocomplete';

describe('HymnAutocomplete localization', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders Spanish search and hymn-book badges', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ hymns: [{ id: '1', hymnNumber: '1', title: 'Himno de prueba', book: 'NEW' }] })))
    );
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <HymnAutocomplete hymnNumber="" hymnTitle="" onChange={vi.fn()} />
      </NextIntlClientProvider>
    );

    const input = await screen.findByPlaceholderText('Buscar por número o título, o escribir libremente…');
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByText('Nuevo')).toBeVisible());
    expect(screen.getByText('Himno de prueba')).toBeVisible();
  });
});
