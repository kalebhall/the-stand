'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clearOfflineData } from '@/src/offline/storage';

export function LogoutForm() {
  const t = useTranslations('core.nav');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogout() {
    setIsSubmitting(true);
    setError(null);
    try {
      await clearOfflineData();
      const loginUrl = new URL('/login', window.location.origin).toString();
      await signOut({ callbackUrl: loginUrl });
    } catch {
      setIsSubmitting(false);
      setError(t('logoutError'));
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
      <p className="text-sm text-muted-foreground">{t('logoutConfirmation')}</p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <button className={cn(buttonVariants(), 'w-full')} disabled={isSubmitting} onClick={onLogout} type="button">
        {isSubmitting ? t('loggingOut') : t('logOut')}
      </button>
    </div>
  );
}
