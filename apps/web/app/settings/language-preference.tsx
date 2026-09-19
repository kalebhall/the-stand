'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ChangeEvent } from 'react';

import { SUPPORTED_LOCALES, type Locale } from '@/src/i18n/config';

export function LanguagePreference({ currentLocale }: { currentLocale: Locale }) {
  const router = useRouter();
  const t = useTranslations('language');
  const [selectedLocale, setSelectedLocale] = useState<Locale>(currentLocale);
  const [status, setStatus] = useState('');

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value;
    if (!SUPPORTED_LOCALES.includes(nextLocale as Locale)) return;

    const locale = nextLocale as Locale;
    document.cookie = `NEXT_LOCALE=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setSelectedLocale(locale);
    setStatus(t('saved'));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <label htmlFor="language-preference" className="text-sm font-medium">
        {t('label')}
      </label>
      <select
        id="language-preference"
        value={selectedLocale}
        onChange={handleChange}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm sm:max-w-xs"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {locale === 'en-US' ? t('english') : t('spanish')}
          </option>
        ))}
      </select>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
