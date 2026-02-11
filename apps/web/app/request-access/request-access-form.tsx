'use client';

import { FormEvent, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FormState = {
  name: string;
  email: string;
  stake: string;
  ward: string;
  message: string;
  website: string;
};

const initialState: FormState = {
  name: '',
  email: '',
  stake: '',
  ward: '',
  message: '',
  website: ''
};

export function RequestAccessForm() {
  const [state, setState] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/public/access-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'Unable to submit request. Please try again.');
        return;
      }

      setSubmitted(true);
      setState(initialState);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg border bg-card p-6 text-card-foreground">
        <h2 className="text-xl font-semibold">Request received</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Thanks for your request. A Support Admin will review and follow up.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-4 rounded-lg border bg-card p-6 text-card-foreground" onSubmit={onSubmit}>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="name">
          Name
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id="name"
          name="name"
          onChange={(event) => setState((previous) => ({ ...previous, name: event.target.value }))}
          required
          value={state.name}
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id="email"
          name="email"
          onChange={(event) => setState((previous) => ({ ...previous, email: event.target.value }))}
          required
          type="email"
          value={state.email}
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="stake">
          Stake
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id="stake"
          name="stake"
          onChange={(event) => setState((previous) => ({ ...previous, stake: event.target.value }))}
          required
          value={state.stake}
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="ward">
          Ward
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id="ward"
          name="ward"
          onChange={(event) => setState((previous) => ({ ...previous, ward: event.target.value }))}
          required
          value={state.ward}
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="message">
          Message
        </label>
        <textarea
          className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm"
          id="message"
          name="message"
          onChange={(event) => setState((previous) => ({ ...previous, message: event.target.value }))}
          required
          value={state.message}
        />
      </div>

      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input
          autoComplete="off"
          id="website"
          name="website"
          onChange={(event) => setState((previous) => ({ ...previous, website: event.target.value }))}
          tabIndex={-1}
          value={state.website}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <button className={cn(buttonVariants())} disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Submitting...' : 'Submit request'}
      </button>
    </form>
  );
}
