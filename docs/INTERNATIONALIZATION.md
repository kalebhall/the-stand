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
- English, Spanish, and pseudo-locale catalogs.
- Root `NextIntlClientProvider`.
- `html[lang]` derived from resolved locale.
- Authenticated language preference persistence with cookie synchronization.
- Settings language selector with loading, saving, and failure states.
- Translation catalog validation with missing/extra-key and ICU checks.
- CI validation step for translation catalogs.
- Stable error codes added to speaker lifecycle API boundary.
- Translated dashboard and meeting editor/At-the-Stand page-shell workflow surfaces.
- Implementation plan and follow-up boundaries.

Operational limitation:

- Migration execution was not run locally because `DATABASE_URL` is unset in this environment. Deployment migration must run before the persisted preference is used against a live database.

Remaining after Phase 1:

- Native-speaker review of Spanish terminology.
- Translate deeper child components inside `MeetingForm`, `WardBusinessSection`, and related workflow controls.
- Add Portuguese (Brazil) and Tagalog catalogs after native reviewers are available.

## Phase 2: Complete first workflow translation — initial vertical slice

Implemented in this slice:

- Added semantic catalogs for meeting-form, business, notes, hymn, and delete-meeting controls.
- Localized core MeetingForm labels, readiness text, save/publish states, and related controls.
- Localized WardBusinessSection action labels and added provider-backed component test coverage.
- Localized InternalNotesPanel and HymnAutocomplete controls.
- Localized delete-meeting confirmation and state labels.
- Localized MembershipOrdinanceSection controls, status labels, Church-source handoff labels, and Spanish component coverage.
- Added Spanish rendered coverage for MeetingForm, InternalNotesPanel, HymnAutocomplete, DeleteMeetingButton, and meeting loading/error states.
- Expanded pseudo-locale coverage to 322 validated message keys.

Remaining in Phase 2:

- Review remaining hard-coded authored/template content and decide whether it should remain source-language content.
- Native-speaker review of all new Spanish terminology; untranslated fallback values are not production-ready.

Every non-English locale requires native-speaker review for:

- Meaning and tone.
- Church terminology.
- Plurals and gendered forms.
- Mobile overflow.
- Print output.
- Accessibility labels.

UI translations must not be used as a substitute for official Church translations.
