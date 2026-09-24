// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    render(<ModuleSettings wardId="ward-1" initial={modules} />);

    expect(screen.getByText(modules[1].description)).toBeTruthy();
    expect(screen.getByText('v1.0.0 · Off by default')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Required' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeEnabled();
  });
});
