'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LogoutForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogout() {
    setIsSubmitting(true);
    setError(null);
    try {
      await signOut({ callbackUrl: '/login' });
    } catch {
      setIsSubmitting(false);
      setError('Unable to log out. Check your connection and try again.');
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
      <p className="text-sm text-muted-foreground">Are you sure you want to log out?</p>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <button
        className={cn(buttonVariants(), 'w-full')}
        disabled={isSubmitting}
        onClick={onLogout}
        type="button"
      >
        {isSubmitting ? 'Logging out...' : 'Log out'}
      </button>
    </div>
  );
}
