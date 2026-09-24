# Multilingual Ward and Hymn Catalog Plan

## Goal

Keep the authenticated interface user-selectable while making each ward/branch's default language determine the hymn catalog and default public-program language.

## Data contract

- `user_account.preferred_locale` remains the user's interface language.
- `ward.default_locale` stores the ward/branch default language.
- `hymn.locale` identifies the language/catalog for each hymn entry.
- Meeting program items keep their existing hymn number/title snapshot. Catalog edits never rewrite historical meetings.

## Initial supported languages

Use the existing locale registry: `en-US` and `es`. Keep `pt-BR` and `tl` planned until message catalogs exist. The schema and admin catalog support are extensible to those languages.

## Behavior

- New hymn autocomplete requests the authenticated user's active ward catalog.
- Ward admins select the ward default language in Settings.
- Support admins add and manage hymn entries with an explicit catalog language.
- User interface language and ward hymn catalog language are independent.
- Print, public, and At-the-Stand hymn links use the meeting/ward language where available and fall back to an official Church search URL when a direct localized URL is not known.

## Implementation slices

1. Add ward default locale and hymn locale schema/migration.
2. Filter authenticated hymn API results by active ward locale.
3. Add ward-language settings and localized support hymn management.
4. Make autocomplete and hymn URLs locale-aware.
5. Add tests for ward isolation, locale filtering, permissions, historical snapshots, and unsupported locale validation.

## Non-goals

- No automatic translation of hymn titles.
- No rewriting of existing meeting program items when a ward language changes.
- No assumption that UI locale and hymn catalog locale are the same.
- No Church policy claims about which hymns a unit should use.
