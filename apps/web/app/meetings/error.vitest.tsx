// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../messages/es.json';
import ErrorBoundary from './error';

describe('meetings error state localization', () => {
  it('renders Spanish recovery controls without exposing raw errors', () => {
    const reset = vi.fn();

    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ErrorBoundary error={new Error('database connection string')} reset={reset} />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByText('No se pudieron cargar las reuniones')).toBeVisible();
    expect(screen.getByText('Ocurrió un problema al cargar las reuniones.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeVisible();
    expect(screen.queryByText('database connection string')).not.toBeInTheDocument();
  });
});
