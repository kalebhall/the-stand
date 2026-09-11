'use client';

import { FormEvent, useState } from 'react';

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = String(formData.get('currentPassword') ?? '');
    const newPassword = String(formData.get('newPassword') ?? '');

    if (!currentPassword && !newPassword) {
      setError('Enter your current password and a new password.');
      setIsSubmitting(false);
      return;
    }
    if (!currentPassword) {
      setError('Enter your current password.');
      setIsSubmitting(false);
      return;
    }
    if (!newPassword) {
      setError('Enter a new password.');
      setIsSubmitting(false);
      return;
    }
    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      setIsSubmitting(false);
      return;
    }

    const response = await fetch('/api/account/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? 'Unable to change password.');
      setIsSubmitting(false);
      return;
    }

    setSuccess('Password changed successfully. You can now access the rest of the application.');
    form.reset();
    setIsSubmitting(false);

    window.location.href = '/dashboard';
  }

  return (
    <form noValidate className="mt-6 flex max-w-md flex-col gap-4" onSubmit={onSubmit}>
      <label htmlFor="current-password" className="flex flex-col gap-1 text-sm font-medium">
        Current password
        <input
          id="current-password"
          required
          minLength={12}
          autoComplete="current-password"
          name="currentPassword"
          type="password"
          aria-describedby={error ? 'password-form-error' : undefined}
          aria-invalid={Boolean(error)}
          className="rounded-md border bg-background px-3 py-2"
        />
      </label>
      <label htmlFor="new-password" className="flex flex-col gap-1 text-sm font-medium">
        New password
        <input
          id="new-password"
          required
          minLength={12}
          autoComplete="new-password"
          name="newPassword"
          type="password"
          aria-describedby={error ? 'password-form-error' : undefined}
          aria-invalid={Boolean(error)}
          className="rounded-md border bg-background px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-fit items-center rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
      >
        {isSubmitting ? 'Saving...' : 'Change password'}
      </button>
      {error ? <p id="password-form-error" role="alert" className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
    </form>
  );
}
