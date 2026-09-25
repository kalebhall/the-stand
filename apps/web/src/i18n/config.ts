export const SUPPORTED_LOCALES = ['en-US', 'es'] as const;
export const PLANNED_LOCALES = ['pt-BR', 'tl', 'to'] as const;
export const SUPPORTED_CATALOG_LOCALES = [...SUPPORTED_LOCALES, ...PLANNED_LOCALES] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type CatalogLocale = (typeof SUPPORTED_CATALOG_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';

export function isSupportedLocale(value: string | undefined | null): value is Locale {
  return value !== undefined && value !== null && SUPPORTED_LOCALES.includes(value as Locale);
}

export function isSupportedCatalogLocale(value: string | undefined | null): value is CatalogLocale {
  return value !== undefined && value !== null && SUPPORTED_CATALOG_LOCALES.includes(value as CatalogLocale);
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function resolveActiveLocale(
  persistedLocale: string | undefined | null,
  cookieLocale: string | undefined | null,
  wardDefaultLocale?: string | undefined | null
): Locale {
  return resolveLocale(persistedLocale ?? cookieLocale ?? wardDefaultLocale);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  'en-US': 'English',
  es: 'Español'
};

export const CATALOG_LOCALE_LABELS: Record<CatalogLocale, string> = {
  'en-US': 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  tl: 'Tagalog',
  to: 'Tongan'
};
