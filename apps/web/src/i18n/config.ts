export const SUPPORTED_LOCALES = ['en-US', 'es'] as const;
export const PLANNED_LOCALES = ['pt-BR', 'tl'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';

export function isSupportedLocale(value: string | undefined | null): value is Locale {
  return value !== undefined && value !== null && SUPPORTED_LOCALES.includes(value as Locale);
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function resolveActiveLocale(persistedLocale: string | undefined | null, cookieLocale: string | undefined | null): Locale {
  return resolveLocale(persistedLocale ?? cookieLocale);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  'en-US': 'English',
  es: 'Español'
};
