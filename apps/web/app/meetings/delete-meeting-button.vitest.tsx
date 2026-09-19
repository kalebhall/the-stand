// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../messages/es.json';
import { DeleteMeetingButton } from './delete-meeting-button';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh })
}));

describe('DeleteMeetingButton localization', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    push.mockReset();
    refresh.mockReset();
  });

  it('uses Spanish confirmation and delete labels', () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <DeleteMeetingButton wardId="ward-1" meetingId="meeting-1" />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('button', { name: 'Eliminar reunión' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar reunión' }));
    expect(window.confirm).toHaveBeenCalledWith('¿Eliminar esta reunión? Esta acción no se puede deshacer.');
  });
});
