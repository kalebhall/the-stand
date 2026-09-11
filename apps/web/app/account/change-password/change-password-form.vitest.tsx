// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChangePasswordForm } from './change-password-form';

describe('ChangePasswordForm', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exposes natural-language labels and reports empty submission', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ChangePasswordForm />);

    expect(screen.getByLabelText('Current password')).toHaveAttribute('id', 'current-password');
    expect(screen.getByLabelText('New password')).toHaveAttribute('id', 'new-password');

    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your current password and a new password.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports short new passwords before calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText('Current password'), 'current-password');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('New password must be at least 12 characters.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
