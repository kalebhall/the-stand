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

    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get('currentPassword') ?? '');
    const newPassword = String(formData.get('newPassword') ?? '');

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
    event.currentTarget.reset();
    setIsSubmitting(false);

    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 700);
  }

  return (
    <form className="mt-6 flex max-w-md flex-col gap-4" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Current password
        <input
          required
          minLength={12}
          autoComplete="current-password"
          name="currentPassword"
          type="password"
          className="rounded-md border bg-background px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        New password
        <input
          required
          minLength={12}
          autoComplete="new-password"
          name="newPassword"
          type="password"
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
    </form>
  );
}
