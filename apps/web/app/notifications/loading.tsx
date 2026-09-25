import { getTranslations } from 'next-intl/server';

export default async function Loading() {
  const t = await getTranslations('notifications');
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('loadingPage')}</p>
      </div>
    </main>
  );
}
