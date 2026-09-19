import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, isSupportedLocale, resolveLocale } from './config';

describe('locale configuration', () => {
  it('accepts only registered locales', () => {
    expect(isSupportedLocale('en-US')).toBe(true);
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });

  it('falls back to English for unsupported values', () => {
    expect(resolveLocale('fr')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
  });
});
