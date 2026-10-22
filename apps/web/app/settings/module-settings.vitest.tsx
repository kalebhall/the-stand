// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
import { ModuleSettings } from './module-settings';

const modules = [
  {
    id: 'conducting-core',
    name: 'Conducting Core',
    description: 'Prepare, conduct, publish, and preserve the sacrament meeting workflow.',
    version: '1.0.0',
    enabled: true,
    defaultEnabled: true,
    overridden: false,
    canDisable: false
  },
  {
    id: 'programs',
    name: 'Programs',
    description: 'Create and manage meeting programs, templates, and printable program layouts.',
    version: '1.0.0',
    enabled: false,
    defaultEnabled: false,
    overridden: false,
    canDisable: true
  }
];

describe('ModuleSettings', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows descriptions and default state while protecting Conducting Core', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <ModuleSettings wardId="ward-1" initial={modules} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText(modules[1].description)).toBeTruthy();
    expect(screen.getByText('v1.0.0 · Off by default')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Required' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeEnabled();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('Beta').closest('p')?.textContent).toContain('Programs');
    expect(screen.getByText('Beta add-ons').closest('details')?.open).toBe(false);
  });
});
