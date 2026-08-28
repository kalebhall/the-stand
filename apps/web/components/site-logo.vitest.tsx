// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SiteLogo } from './site-logo';

describe('SiteLogo', () => {
  afterEach(() => cleanup());

  it('renders accessible full logo link', () => {
    render(<SiteLogo />);

    expect(screen.getByRole('link', { name: 'The Stand' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByText('The Stand')).toBeVisible();
  });

  it('keeps an accessible label when name is hidden', () => {
    render(<SiteLogo showName={false} />);

    expect(screen.getByRole('link', { name: 'The Stand' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByText('The Stand')).toHaveClass('sr-only');
  });
});
