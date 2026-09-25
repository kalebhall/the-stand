// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
const messages = MESSAGE_CATALOGS.es;
import Loading from './loading';

describe('meetings loading state localization', () => {
  afterEach(() => cleanup());

  it('renders Spanish loading text', () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <Loading />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Cargando…')).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });
});
