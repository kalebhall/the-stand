'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ChangeEvent } from 'react';

import { SUPPORTED_LOCALES, isSupportedLocale, type Locale } from '@/src/i18n/config';

function setLocaleCookie(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LanguagePreference({ currentLocale }: { currentLocale: Locale }) {
  const router = useRouter();
  const t = useTranslations('language');
  const [selectedLocale, setSelectedLocale] = useState<Locale>(currentLocale);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/account/preferences', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || !('locale' in body)) return null;
        const locale = body.locale;
        return typeof locale === 'string' && isSupportedLocale(locale) ? locale : null;
      })
      .then((locale) => {
        if (cancelled || !locale || locale === selectedLocale) return;
        setSelectedLocale(locale);
        setLocaleCookie(locale);
        router.refresh();
      })
      .catch(() => {
        if (!cancelled) setStatus(t('loadFailed'));
      });

    return () => {
      cancelled = true;
    };
  }, [router, selectedLocale, t]);

  async function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value;
    if (!SUPPORTED_LOCALES.includes(nextLocale as Locale)) return;

    const locale = nextLocale as Locale;
    setStatus(t('saving'));

    try {
      const response = await fetch('/api/account/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale })
      });

      if (!response.ok) {
        setStatus(t('saveFailed'));
        return;
      }

      setLocaleCookie(locale);
      setSelectedLocale(locale);
      setStatus(t('saved'));
      router.refresh();
    } catch {
      setStatus(t('saveFailed'));
    }
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
