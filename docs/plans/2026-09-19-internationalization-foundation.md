# Internationalization Foundation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Establish a safe, testable localization foundation for The Stand before translating complete workflows.

**Architecture:** Use `next-intl` with semantic JSON message catalogs. Resolve the locale from a temporary cookie now, then add authenticated user preference persistence before broad translation. Keep user-authored content and official Church wording separate from UI translation.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, `next-intl`, Vitest, PostgreSQL/Drizzle.

---

## Scope boundary

Phase 1 builds the localization seam. It does not translate the whole application, machine-translate user content, or claim official Church wording is localized.

## Tasks

### Task 1: Add locale registry and source catalog — Complete

- Create `apps/web/src/i18n/config.ts`.
- Create `apps/web/messages/en-US.json`.
- Reserve `es`, `pt-BR`, and `tl` without advertising them as complete.
- Use semantic keys and ICU-compatible message values.
- Add a pure test for supported-locale validation and fallback behavior.

### Task 2: Wire `next-intl` into the App Router — Complete

- Create `apps/web/src/i18n/request.ts`.
- Update `apps/web/next.config.ts` with the `next-intl` plugin.
- Update `apps/web/app/layout.tsx` to load locale/messages and render `NextIntlClientProvider`.
- Set `html[lang]` from the resolved locale.
- Verify server and client message access through a real rendered settings surface.

### Task 3: Add temporary language selection — Complete

- Create a client-side language selector in the settings surface.
- Store only supported locale codes in the `NEXT_LOCALE` cookie.
- Refresh the route after selection.
- Add accessible labels and a visible current-language state.
- Document that this cookie is temporary until authenticated persistence exists.

### Task 4: Persist user language preference — Complete, deployment migration pending

- Add a forward migration adding nullable `preferred_locale` to `user_account` with a database check constraint.
- Add the field to Drizzle schema/types.
- Add authenticated read/write behavior in account settings.
- Resolve authenticated preference before cookie fallback.
- Test invalid locale rejection, default fallback, and user isolation.

### Task 5: Add translation quality gates — Complete

- Add a catalog validation script.
- Fail on missing or extra keys compared with `en-US`.
- Fail on malformed ICU messages.
- Add a pseudo-locale transformation or fixture (`en-XA`) for expansion testing.
- Add the validation command to CI.

### Task 6: Convert one complete workflow — Page-shell slice complete; child-component translation remains

- Select dashboard → meeting editor → At-the-Stand after the foundation passes.
- Extract interface strings only.
- Keep meeting notes, announcements, and other user-authored content unchanged.
- Convert API errors to stable error codes before translating them.
- Test loading, empty, error, permission, offline, print, and success states.

### Phase 2: Complete first workflow translation — Initial vertical slice complete

- Added semantic catalogs for meeting-form, business, notes, hymn, and delete-meeting controls.
- Localized core child controls and added provider-backed component coverage.
- Catalog validation currently covers 405 keys across English, Spanish, and pseudo-locale catalogs.
- Remaining: translate public published-snapshot generation; complete offline/permission state coverage; finish offline data labels and conflict language; review authored/template content and complete native Spanish review.

## Verification gates

From repository root:

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test
npm run typecheck
npm run build
npm run format:check
```

For browser work, run the isolated authenticated browser path and verify language switching at desktop and mobile widths. Do not call the workflow translated until the actual rendered path is exercised.

## Acceptance criteria for Phase 1

- Locale selection changes rendered `html[lang]` and translated settings text.
- Unsupported locale values never enter application state.
- English remains a complete fallback catalog.
- Translation catalog validation runs deterministically.
- User-authored and official Church content are not silently machine-translated.
- No route duplication by language exists.
- Scope and remaining work are documented honestly.
