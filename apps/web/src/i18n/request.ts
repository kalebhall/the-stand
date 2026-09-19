import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { auth } from '@/src/auth/auth';
import { pool } from '@/src/db/client';

import { DEFAULT_LOCALE, isSupportedLocale, resolveActiveLocale } from './config';

async function loadPersistedLocale(): Promise<string | undefined> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return undefined;

    const result = await pool.query('SELECT preferred_locale FROM user_account WHERE id = $1::uuid AND is_active = true LIMIT 1', [userId]);
    const persistedLocale = result.rows[0]?.preferred_locale;
    return isSupportedLocale(persistedLocale) ? persistedLocale : undefined;
  } catch (error) {
    console.warn('i18n_persisted_locale_unavailable', error);
    return undefined;
  }
}

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
  const persistedLocale = await loadPersistedLocale();
  const locale = resolveActiveLocale(persistedLocale, cookieLocale);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    onError(error) {
      if (locale !== DEFAULT_LOCALE) {
        console.warn('i18n_message_fallback', { locale, error: error.message });
      }
    }
  };
});
