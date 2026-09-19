// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import messages from '../../messages/es.json';
import Loading from './loading';

describe('meetings loading state localization', () => {
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
