'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LogoutForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onLogout() {
    setIsSubmitting(true);
    await signOut({ callbackUrl: '/login' });
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
      <p className="text-sm text-muted-foreground">Are you sure you want to log out?</p>
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
