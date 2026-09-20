# Program Designer — Milestones 5–7 Repository-Specific Implementation Plan

Status: planning only. Do not implement until explicitly authorized.

## Goal

Extend the Milestones 1–4 Document Designer foundation with:

- Milestone 5: Advanced Designer behavior.
- Milestone 6: ward/stake/system media management and safe image handling.
- Milestone 7: print preview, overflow validation, deterministic PDF export, and draft/published downloads.

The implementation must continue using `Document → Pages → Regions → Blocks`, preserve the existing public-program snapshot architecture, and keep `public_program_layout`, `buildMeetingRenderHtml()`, `/meetings/[meetingId]/print`, `/p/{meetingToken}`, and `/p/ward/{portalToken}` available as compatibility paths.

## Repository evidence and boundaries

- Repository: `/root/workspaces/the-stand`.
- Latest committed migration is `apps/web/drizzle/0062_offline_mutation_meeting_scope.sql`; planned Milestones 1–4 use `0063`–`0065`, so these milestones should use `0066` onward only after those migrations are actually present.
- Current working tree is dirty before this plan: modified `docs/DEPENDENCY_GRAPH.md`, untracked `apps/web/src/document-designer/`, and untracked `docs/PROGRAM_DESIGNER_MILESTONES_1_4_PLAN.md`. The current untracked designer code is foundation-only (`types.ts`, `schema.ts`, `constants.ts`, `primitives.ts`, `registry.ts`, `sacrament-program.ts`, and tests); it is not evidence that Milestones 1–4 are complete.
- Baseline evidence from the current tree:
  - `npm test --workspace @the-stand/web -- --run src/document-designer`: 2 files, 40 tests passed.
  - `npm run typecheck --workspace @the-stand/web`: pre-existing failures in `src/imports/purge-runner.ts`, `src/imports/purge.ts`, and `src/maintenance/retention.ts`/`retention-contract.vitest.ts` because JavaScript contract modules have no declarations.
  - `npm run lint --workspace @the-stand/web`: command was rejected because the workspace lint script does not accept the forwarded `--workspace` option in this invocation; rerun from `apps/web` or with the repository’s supported workspace command before implementation.
- Stack: Next.js App Router, React 19, strict TypeScript, raw `pg` route queries alongside Drizzle schema definitions, PostgreSQL RLS, Zod, Vitest/jsdom, Playwright, and existing `jspdf`/`qrcode` dependencies.
- Existing print generation already uses `apps/web/src/lib/qr-pdf.ts` and `jspdf`; reuse this self-hosted approach rather than adding a SaaS PDF service.
- Existing public HTML is stored in `meeting_program_render.render_html`; `public_program_share` supplies stable tokens. Milestone 7 must not make public routes render live drafts.

## Dependency gate before Milestone 5

Before coding Milestone 5, verify the Milestones 1–4 handoff exists and is green: `document_template`, `document_template_version`, `meeting_document`, `ward_document_settings`, the program-specific permission helpers, the renderer/compatibility adapter, template routes/gallery, and the Simple Mode program-design route/client. If any are absent, execute the earlier plan first; do not make Milestone 5 compensate by adding a second parallel foundation.

Planned migration numbering assumes:

- `0063_program_editor_role.sql`
- `0064_document_designer_foundation.sql`
- `0065_program_designer_builtin_templates.sql`
- `0066` starts Milestone 5.

---

# Milestone 5 — Advanced Designer

## Outcome

An authorized Advanced Mode user can add and remove permitted blocks, move blocks between regions, configure region columns, resize blocks only to supported widths, use snapping, edit advanced style/layout properties, create a blank layout, and undo/redo changes. The same persisted schema is used by Simple and Advanced Mode; Advanced Mode is not a second document format.

## Data/model changes

Use a versioned JSON layout update rather than normalizing every block into relational rows.

- Extend `DocumentRegion` with typed `columns` configuration:
  - `count: 1 | 2 | 3`
  - optional supported ratios (`1/1`, `1/3 + 2/3`, `2/3 + 1/3`)
  - bounded gutter
  - ordered column block containers or an equivalent typed representation.
- Extend `DocumentBlock` with:
  - `styleOverrides` from a curated whitelist;
  - optional `visibility` rule definitions;
  - optional logical `digitalOrder`/digital placement metadata;
  - existing `width` constrained to `FULL`, `TWO_THIRDS`, `HALF`, `ONE_THIRD`.
- Add a schema migration helper from layout schema version 1 to version 2. Existing v1 documents must load unchanged and be upgraded only when saved; no silent template rewrite.
- Keep `lock_json` authoritative for structure, position, size, style, visibility, and content restrictions. Enforce locks on the server, not only in drag/drop controls.
- No new relational table is required for Advanced Mode. `meeting_document.layout_json`, `document_template_version.layout_json`, `theme_json`, and `lock_json` remain the persisted sources of truth.

Files to create:

- `apps/web/src/document-designer/advanced-schema.ts` — v2 layout types, Zod schemas, and v1→v2 normalization.
- `apps/web/src/document-designer/layout-operations.ts` — pure add/remove/move/reorder/resize/column/snap operations.
- `apps/web/src/document-designer/lock-enforcement.ts` — server-side structure/property lock checks.
- `apps/web/src/document-designer/advanced-validation.ts` — region/column/width/grid constraints and unsupported combinations.
- `apps/web/src/document-designer/history.ts` — bounded immutable undo/redo history with dirty-state tracking.
- `apps/web/src/document-designer/advanced-schema.vitest.ts`
- `apps/web/src/document-designer/layout-operations.vitest.ts`
- `apps/web/src/document-designer/lock-enforcement.vitest.ts`
- `apps/web/src/document-designer/advanced-validation.vitest.ts`
- `apps/web/src/document-designer/history.vitest.ts`

Files to modify:

- `apps/web/src/document-designer/types.ts`
- `apps/web/src/document-designer/schema.ts`
- `apps/web/src/document-designer/primitives.ts`
- `apps/web/src/document-designer/constants.ts`
- `apps/web/src/document-designer/registry.ts` — expose advanced property metadata and supported placement/width capabilities.
- `apps/web/src/document-designer/meeting-document-service.ts` — normalize v1/v2, enforce locks and revision checks on save.
- `apps/web/src/document-designer/preview-contract.ts` — accept the same normalized v2 layout used by preview and publication.
- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-design/route.ts` — expose Advanced Mode capability and reject unauthorized advanced mutations.
- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-design/validate/route.ts` if validation is a separate route in the Milestone 4 implementation.
- `apps/web/app/programs/[meetingId]/designer-state.ts` — history, keyboard commands, drag transaction boundaries, conflict handling.
- `apps/web/app/programs/[meetingId]/program-designer-client.tsx` — Advanced Mode controls while retaining keyboard alternatives.
- `apps/web/app/programs/[meetingId]/program-designer-client.vitest.tsx`
- `apps/web/app/programs/[meetingId]/designer-state.vitest.ts`
- `apps/web/src/auth/roles.ts` only if `canUseAdvancedProgramDesigner()` still needs the final ward-setting/role combination; do not broaden `canManageMeetings()`.

Migration:

- Create `apps/web/drizzle/0066_program_designer_advanced_layout.sql` only for an explicit database constraint or metadata needed by the implemented v2 contract. Prefer no relational migration if the existing JSONB columns and `schema_version` fields are sufficient. The application migration must be explicit and tested even if the SQL migration is a no-op metadata/check migration.

## Advanced UI behavior

Page: `/programs/[meetingId]` remains the owner. Add:

- Advanced Mode entry only when `canUseAdvancedProgramDesigner()` succeeds and ward settings permit it.
- Block library add/remove controls.
- Region/page inspector with 1/2/3-column options and supported ratios.
- Snap-to-region/column/grid placement; no arbitrary absolute coordinates.
- Width controls and drag handles that snap to the four supported widths.
- Style inspector limited to curated fonts, bounded sizes, alignment, spacing, borders, and image placement.
- Blank Layout action that creates a validated empty document, not an unvalidated client object.
- Undo, redo, keyboard shortcuts, and visible dirty/saved/conflict state.
- Accessible keyboard move/add/remove alternatives; drag/drop must not be the only interaction path.
- Overflow indicators are warnings only in this milestone; final blocking/overflow rules belong to Milestone 7.

## Routes and contracts

Existing route, extended:

- `GET /api/w/{wardId}/meetings/{meetingId}/program-design`
  - Adds `advancedMode`, permitted operations, lock metadata, schema version, and capability information.
- `PUT /api/w/{wardId}/meetings/{meetingId}/program-design`
  - Accepts the complete normalized layout/theme plus `expectedRevision` and an explicit mode/operation context.
  - Rejects stale revisions with `409 REVISION_CONFLICT`.
  - Rejects unauthorized Advanced Mode or locked properties with `403 FORBIDDEN`/`409 LOCKED_LAYOUT`.
  - Does not publish or alter meeting program-item rows.
- `POST /api/w/{wardId}/meetings/{meetingId}/program-design/validate`
  - Returns structured errors/warnings for schema, permissions, locks, and renderer capability.

No public route or public token format changes are allowed.

## Milestone 5 tests

- Layout v1 loads and upgrades to v2 without changing block IDs or logical order.
- Column counts, ratios, gutters, supported widths, and snap positions accept valid values and reject arbitrary pixel/free-floating values.
- Add/remove/reorder/move operations preserve stable IDs and never mutate meeting-program-item data.
- Undo/redo handles add, drag transaction, move, resize, and property changes as coherent history entries; redo is invalidated after a new edit.
- Advanced Mode denied when the ward setting is false or the role lacks the helper permission.
- Program Editor cannot bypass structure/style/content locks through a forged API payload.
- Cross-ward meeting/design access returns denial and cannot read the other ward’s JSON.
- Revision conflicts preserve the server document and return the local draft to the client without silent loss.
- UI tests cover keyboard equivalents, focus/selection, accessible labels, drag/drop alternative, and disabled Blank Layout.
- Browser test in `apps/web/e2e/program-designer-advanced.spec.ts` covers add/move/resize/undo/redo/reload persistence when the configured E2E fixture has two wards and Advanced Mode enabled.

## Milestone 5 gate

Run formatting/checks, focused document-designer/API/component tests, the route/RLS integration suite with disposable PostgreSQL, typecheck, lint from `apps/web`, build, and the Advanced Mode Playwright spec. Record pre-existing typecheck failures separately.

---

# Milestone 6 — Media Library and Safe Image Handling

## Outcome

Authorized users can upload and select ward/stake/system images through a controlled media library. Uploaded files are validated, isolated, stored outside the database, served through controlled routes, and carry accessibility/print metadata. Public publication never exposes an unauthorized or deleted asset.

## Database

Create `apps/web/drizzle/0067_document_designer_media.sql` and add corresponding Drizzle definitions in `apps/web/src/db/schema.ts`.

Table: `media_asset`

- `id UUID PRIMARY KEY`
- `scope_type TEXT NOT NULL` — `SYSTEM`, `STAKE`, `WARD`
- `ward_id UUID NULL REFERENCES ward(id)`
- `stake_id UUID NULL REFERENCES stake(id)` if the existing schema exposes stake ownership
- `owner_user_id UUID NULL REFERENCES user_account(id)`
- `filename TEXT NOT NULL` — display name only, never a filesystem path
- `storage_key TEXT NOT NULL UNIQUE` — generated opaque key
- `public_token TEXT NULL UNIQUE` — opaque token if public image delivery is needed
- `mime_type TEXT NOT NULL`
- `byte_size INTEGER NOT NULL`
- `pixel_width INTEGER NOT NULL`
- `pixel_height INTEGER NOT NULL`
- `alt_text TEXT NULL`
- `is_decorative BOOLEAN NOT NULL DEFAULT FALSE`
- `status TEXT NOT NULL DEFAULT 'ACTIVE'` — `ACTIVE`, `ARCHIVED`, `QUARANTINED`
- `created_by_user_id UUID NOT NULL REFERENCES user_account(id)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints/indexes:

- MIME allowlist only `image/jpeg`, `image/png`, `image/webp`; reject SVG.
- Positive bounded byte size and pixel dimensions; enforce a server-side maximum upload size.
- Ward rows require `ward_id`; system/stake rows cannot be written by ward users.
- Index `(ward_id, status, created_at DESC)` and `(scope_type, status, created_at DESC)`.
- Enable and force RLS with explicit ward/current-user policies. Ward users can read active media available to their ward and write only ward media when `canManageProgramMedia()` permits. They cannot write source stake/system rows.
- Deletion is archive/soft-delete. Do not unlink assets referenced by a meeting document or immutable published artifact.

Files to create:

- `apps/web/src/document-designer/media-types.ts`
- `apps/web/src/document-designer/media-validation.ts` — size, MIME sniffing, image decode, re-encode, dimensions, alt/decorative rules, print-resolution checks.
- `apps/web/src/document-designer/media-storage.ts` — opaque key generation, private filesystem root/configuration, atomic write/read/delete, path traversal protection.
- `apps/web/src/document-designer/media-service.ts` — scope authorization, list/upload/archive, ownership checks.
- `apps/web/src/document-designer/media-types.vitest.ts`
- `apps/web/src/document-designer/media-validation.vitest.ts`
- `apps/web/src/document-designer/media-storage.vitest.ts`
- `apps/web/src/document-designer/media-service.vitest.ts`
- `apps/web/src/db/document-designer-media-rls.vitest.ts`

Files to modify:

- `apps/web/src/db/schema.ts`
- `apps/web/src/auth/roles.ts` only if the foundation helper needs final role/settings wiring.
- `apps/web/src/document-designer/registry.ts` and `sacrament-program.ts` — IMAGE config references an asset ID/version plus crop/fit/alt/decorative metadata, not an arbitrary URL.
- `apps/web/src/document-designer/schema.ts` — validate asset references and image configuration.
- `apps/web/src/document-designer/data-resolver.ts`/`public-safety.ts` — resolve only authorized, active assets and enforce public-safe metadata.
- `apps/web/app/programs/[meetingId]/program-designer-client.tsx` — media picker, upload state, crop/fit controls, alt/decorative controls, inadequate-resolution warning.
- `apps/web/app/programs/[meetingId]/program-designer-client.vitest.tsx`
- `apps/web/app/programs/templates/template-gallery-client.tsx` if template thumbnails become managed assets.
- `docs/INSTALL.md` or deployment documentation for the required private media root, permissions, backup, and restore behavior.

## Routes

Create:

- `GET /api/w/{wardId}/media` — list readable active media by scope/filter.
- `POST /api/w/{wardId}/media` — multipart upload; enforce auth, active ward, permission, size/MIME/dimension checks, decode/re-encode, alt/decorative metadata, and audit log.
- `GET /api/w/{wardId}/media/{assetId}` — authenticated metadata/read path; do not expose `storage_key`.
- `PATCH /api/w/{wardId}/media/{assetId}` — update alt text, decorative flag, crop metadata, or archive state where permitted.
- `DELETE /api/w/{wardId}/media/{assetId}` — archive only, with reference checks.
- `GET /media/{publicToken}` — only if the renderer needs an image-specific public URL. This route accepts the opaque token, never a ward ID, sends immutable/cache-safe headers only for an active public-safe asset, and does not return private metadata.

Every route needs unauthenticated, wrong-ward, insufficient-role, malformed multipart, oversized-file, spoofed-MIME, unsupported-format, traversal, DB/storage failure, and successful read/write tests.

## Media security and privacy tests

- A Ward A user cannot list, read, mutate, or infer Ward B assets.
- Ward users cannot upload stake/system assets or modify source assets.
- A forged `assetId`/`storageKey` cannot escape the configured media root.
- JPEG/PNG/WebP decode/re-encode strips unexpected payloads and rejects SVG/HTML masquerading as images.
- Identifiable-person upload displays an informational privacy reminder; it is not treated as a substitute for authorization.
- Non-decorative images require alt text before public validation; decorative images must not expose misleading alt text.
- Images below the required DPI for the selected physical size produce a warning, not a silent upscale.
- Archived assets cannot render in new documents and remain available only where historical/public snapshot policy explicitly requires them.
- Media route and component tests verify progress/error/retry state and keyboard-accessible selection.
- `apps/web/e2e/program-designer-media.spec.ts` covers upload, selection, alt text, save, reload, and denied cross-ward access with a disposable media root.

## Milestone 6 gate

Run media unit/service tests, real PostgreSQL RLS tests, route tests, component tests, the media E2E spec, typecheck, lint, build, and a backup/restore or deployment smoke check proving the configured media root is not accidentally inside a disposable build directory.

---

# Milestone 7 — Print Preview, Overflow Validation, and PDF Export

## Outcome

The designer provides trustworthy print/folded previews, detects overflow without silently shrinking text or adding sheets to fixed folded formats, and produces deterministic draft and published PDFs using a self-hosted renderer. PDF downloads use the same normalized layout/data contract as preview and publication.

## Renderer/PDF architecture

- Keep browser HTML preview for interactive editing.
- Add a server-side deterministic PDF renderer that consumes normalized document layout, resolved safe data, theme, and media references.
- Reuse `jspdf` and `qrcode` already present in `apps/web/package.json`/`apps/web/src/lib/qr-pdf.ts`; do not use browser Print → Save as PDF as the only implementation and do not introduce external SaaS.
- Make physical sizes explicit: Letter, A4, portrait/landscape, half-sheet/two-up, bifold, trifold. Legal remains unsupported.
- Use the same block registry render metadata for PDF and HTML, but allow separate print drawing functions where HTML CSS cannot guarantee pagination.
- PDF generation must be on demand, never on every drag/autosave. Use bounded time/size limits and return a stable error for unrenderable documents.
- Attach a deterministic render metadata object to validation/download results: schema version, layout hash, template/version, media asset IDs/versions, renderer version, and generated-at-independent inputs. Do not put sensitive internal data in metadata.

Files to create:

- `apps/web/src/document-designer/print-types.ts`
- `apps/web/src/document-designer/print-layout.ts` — physical dimensions, margins, fold panels, columns, safe areas, page count.
- `apps/web/src/document-designer/overflow.ts` — text/image measurement, min font constraints, fixed-fold vs flowing-page rules, structured warnings/errors.
- `apps/web/src/document-designer/pdf-renderer.ts` — deterministic jsPDF implementation for page/region/block composition.
- `apps/web/src/document-designer/pdf-download.ts` — response headers, safe filename, byte output, content disposition.
- `apps/web/src/document-designer/print-preview-contract.ts`
- `apps/web/src/document-designer/print-layout.vitest.ts`
- `apps/web/src/document-designer/overflow.vitest.ts`
- `apps/web/src/document-designer/pdf-renderer.vitest.ts`
- `apps/web/src/document-designer/pdf-fixtures.vitest.ts`
- `apps/web/src/document-designer/print-preview-contract.vitest.ts`

Files to modify:

- `apps/web/src/document-designer/renderer.ts` and `block-renderers.ts` — expose print measurements/render metadata and preserve semantic digital HTML.
- `apps/web/src/document-designer/preview-contract.ts` — add print/folded/front/back modes and validation diagnostics.
- `apps/web/src/document-designer/meeting-document-service.ts` — resolve draft versus published source explicitly.
- `apps/web/app/programs/[meetingId]/program-designer-client.tsx` — Print Preview → Front/Back/Folded, overflow panel, Download Draft PDF, Preview as Public Visitor.
- `apps/web/app/programs/[meetingId]/preview.tsx` if preview is separated from the client shell.
- `apps/web/app/meetings/[meetingId]/print/page.tsx` — preserve published-version behavior and add a permission-gated link to the designer’s print/PDF path where appropriate; do not remove legacy fallback.
- `apps/web/src/meetings/render.ts` only for a compatibility adapter, not for new PDF layout logic.
- `apps/web/app/meetings/[meetingId]/edit/page.tsx` for contextual Draft PDF/Program Designer links if the existing page owns those actions.
- `apps/web/e2e/print-preview.spec.ts` and/or create `apps/web/e2e/program-designer-print.spec.ts`.

## Routes

Create:

- `POST /api/w/{wardId}/meetings/{meetingId}/program-design/print-validate`
  - Validates a supplied draft layout or stored revision using server-authoritative data and returns `errors`, `warnings`, `pageCount`, `foldGuidance`, and non-sensitive render metadata.
- `GET /api/w/{wardId}/meetings/{meetingId}/program-design/pdf?source=draft`
  - Requires program-view permission and draft read access.
  - Returns `application/pdf` for the current saved draft; does not publish.
- `GET /api/w/{wardId}/meetings/{meetingId}/program-design/pdf?source=published&version=N`
  - Requires permission to inspect the ward’s published version.
  - Renders the immutable stored published structured snapshot/render inputs for version `N`, never current draft data.
- `GET /meetings/{meetingId}/program-design/print` if a dedicated authenticated server page is needed for folded preview; otherwise keep print preview inside `/programs/{meetingId}` and use the API only for PDF bytes.

Do not add ward IDs to public routes. Do not make `/p/{meetingToken}` or `/p/ward/{portalToken}` generate a PDF from live data. If public PDF download is later required, it must be a separate token-scoped contract and is outside Milestone 7 unless explicitly approved.

## Overflow rules

- Measure against the selected physical page/region/column, safe margins, and minimum font sizes.
- Normal full-page layouts may flow to additional pages and report the generated page count.
- Fixed bifold/trifold/half-sheet layouts must not silently create another physical sheet; return a blocking error with actionable suggestions.
- Never silently shrink below the curated minimum font size.
- Mark image DPI insufficiency as a warning unless the image cannot be rendered.
- Required-region overflow is an error; optional block overflow can be a warning only when the user can remove, compact, or move the block.
- Include `hideWhenEmpty`, print-only/digital-only, lock, and conditional-visibility behavior in measurements.

## PDF tests and fixtures

- Deterministic same-input PDF output has stable page count and stable normalized render metadata; if raw bytes contain unavoidable producer timestamps, strip/set them before comparing hashes.
- Letter portrait/landscape, A4, half-sheet, bifold, and trifold dimensions are correct.
- Front/back/folded previews show the expected panel/region order.
- Full-page long content flows to additional pages; fixed folded overflow blocks download and reports the offending block IDs.
- Minimum font size is never violated.
- Image blocks use approved media, crop/fit settings, alt/decorative metadata, and resolution diagnostics.
- QR blocks encode the intended safe URL and preserve print-only behavior where configured.
- Draft PDF reflects saved draft changes but does not create `meeting_program_render`, change meeting status, or modify `public_program_share`.
- Published PDF reads the requested immutable version and remains unchanged after later draft edits.
- Unsafe custom text, internal-only blocks, invalid HTTPS links, inaccessible images, and locked property changes are rejected server-side.
- Download route tests cover auth, wrong ward, missing meeting, invalid source/version, validation errors, DB failure, PDF failure, content type, content disposition, and no accidental HTML/JSON leakage in successful PDF responses.
- `apps/web/e2e/program-designer-print.spec.ts` covers print preview mode, overflow warning/error, draft PDF download, reload, and separation from publish.

## Milestone 7 gate

Run focused schema/renderer/overflow/PDF tests, route tests, existing print/publication tests, RLS integration tests, component tests, Playwright print/PDF tests, typecheck, lint, build, `git diff --check`, and verify that legacy print output and stable public URLs still work. Report PDF byte/page evidence separately from HTML preview and public snapshot evidence.

---

# Cross-milestone documentation updates

After each verified milestone, update only the relevant sections of:

- `docs/API.md` — routes, permissions, request/response/error contracts.
- `docs/UI.md` — Advanced Mode, media library, print/PDF interaction and accessibility behavior.
- `docs/ARCHITECTURE.md` — schema versioning, storage boundary, renderer/PDF boundary, and compatibility path.
- `docs/SCHEMA.md` — `media_asset`, JSON layout v2, RLS policies, indexes, and migration numbers.
- `docs/PLANS.md` — milestone status and remaining non-goals.
- `docs/DEPENDENCY_GRAPH.md` — regenerate only through the repository’s documented command after source changes; do not claim it is current during planning-only work.

## Explicit non-goals for Milestones 5–7

- No baptism, funeral, or second document type.
- No unrestricted absolute positioning, arbitrary CSS/HTML/JS, arbitrary fonts, SVG uploads, background images, legal-size paper, commercial bleed/crop tooling, or collaborative real-time editing.
- No publication history/rollback/expiration enhancement work beyond consuming the existing immutable publication contract; those belong to Milestone 8.
- No stake/system administration UI beyond consuming authorized readable templates/media and preserving source write protection; broader administration and required/locked template workflows belong to Milestone 9.
- No deletion of `public_program_layout`, `buildMeetingRenderHtml()`, `meeting_program_render`, `public_program_share`, or existing public routes.

## Completion rule

Do not mark a milestone complete because files exist or a build passes. Completion requires the named routes and tables to be exercised, server-side authorization and RLS evidence, unit/component tests, renderer/PDF fixtures, and browser evidence where infrastructure is available. Skipped database or E2E tests must be reported as skipped, not treated as passing.
