'use client';

import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations('meetings');

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6" aria-busy="true">
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    </main>
  );
}
