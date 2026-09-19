# Internationalization

## Goal

Make The Stand usable by members who speak different languages without duplicating routes, changing stored domain values, or translating authoritative Church wording incorrectly.

## Product rules

- User interface language follows each user's preference.
- Shared user-authored content remains in its original language unless a user explicitly requests a translation.
- Stored enum/status values stay language-neutral; only display labels are translated.
- Official Church wording uses official localized sources when available. The app must not present machine-translated wording as authoritative.
- English (`en-US`) is the source locale and final fallback.

## Locale resolution

Current phase uses a `NEXT_LOCALE` cookie so the preference works before the user-preference database field exists. Resolution order:

1. Valid `NEXT_LOCALE` cookie.
2. `en-US` fallback.

Planned resolution order after persistence:

1. Authenticated user preference.
2. Valid `NEXT_LOCALE` cookie.
3. Ward/stake default, if configured.
4. Browser language.
5. `en-US` fallback.

## Technical approach

- Next.js App Router with `next-intl`.
- Locale messages stored in `apps/web/messages/<locale>.json`.
- Semantic keys, not English sentences as keys.
- ICU messages for plurals and interpolated values.
- No string concatenation for user-facing sentences.
- Pseudo-locale testing before broad translation work.

Initial locale catalogs:

- `en-US` — complete source and fallback.
- `es` — initial catalog for the localization surface only; the app is not fully translated.

Planned locales:

- `pt-BR`.
- `tl`.

## Phase 1 status

Implemented:

- `next-intl` dependency and request configuration.
- Supported-locale registry.
- English message catalog.
- Root `NextIntlClientProvider`.
- `html[lang]` derived from resolved locale.
- Settings language selector using a local preference cookie.
- Translation used in the settings language preference surface.
- Implementation plan and follow-up boundaries.

Remaining in Phase 1:

- Persist `preferred_locale` on `user_account`.
- Replace cookie-only preference with authenticated user preference plus cookie fallback.
- Add CI check for missing/extra keys and invalid ICU messages.
- Add `en-XA` pseudo-locale.
- Convert API errors to stable translatable error codes.
- Migrate the first complete workflow rather than translating isolated labels.

## Translation review

Every non-English locale requires native-speaker review for:

- Meaning and tone.
- Church terminology.
- Plurals and gendered forms.
- Mobile overflow.
- Print output.
- Accessibility labels.

UI translations must not be used as a substitute for official Church translations.
