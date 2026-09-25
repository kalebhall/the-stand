'use client';

import { useTranslations } from 'next-intl';

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('imports');
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <div className="rounded-lg border border-destructive bg-card p-6 text-center">
        <h2 className="text-lg font-semibold">{t('somethingWrong')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('callings.failed')}</p>
        <button onClick={reset} className="mt-4 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
          {t('tryAgain')}
        </button>
      </div>
    </main>
  );
}
