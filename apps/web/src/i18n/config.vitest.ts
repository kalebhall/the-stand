import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, isSupportedCatalogLocale, isSupportedLocale, resolveActiveLocale, resolveLocale } from './config';

describe('locale configuration', () => {
  it('accepts only registered locales', () => {
    expect(isSupportedLocale('en-US')).toBe(true);
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });

  it('allows planned languages for hymn catalogs before UI translations are complete', () => {
    expect(isSupportedCatalogLocale('pt-BR')).toBe(true);
    expect(isSupportedCatalogLocale('tl')).toBe(true);
    expect(isSupportedCatalogLocale('to')).toBe(true);
    expect(isSupportedCatalogLocale('fr')).toBe(false);
  });

  it('falls back to English for unsupported values', () => {
    expect(resolveLocale('fr')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it('prefers persisted user locale over cookie locale', () => {
    expect(resolveActiveLocale('es', 'en-US')).toBe('es');
    expect(resolveActiveLocale(null, 'es')).toBe('es');
    expect(resolveActiveLocale(null, null, 'es')).toBe('es');
    expect(resolveActiveLocale('en-US', null, 'es')).toBe('en-US');
    expect(resolveActiveLocale(null, null)).toBe(DEFAULT_LOCALE);
  });
});
