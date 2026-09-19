import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, resolveLocale } from './config';

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
  const locale = resolveLocale(cookieLocale);

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
