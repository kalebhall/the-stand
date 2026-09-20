# Program Designer — Milestones 1–4 Implementation Plan

> **Current status:** Milestones 1–3 are implemented in the current working tree. Milestone 3 adds eight validated built-in templates, ward-scoped template query/copy/version/publish APIs, the role-gated Programs/template gallery workflow, and meeting creation-time template inheritance. Milestone 4 remains planned. Live PostgreSQL/RLS execution remains pending because no database URL is configured.

> **For Hermes:** Use `software-development:subagent-driven-development` to implement this plan task-by-task, with spec-compliance review and code-quality review after each task.

**Goal:** Introduce the generic Document Designer foundation, preserve the existing public-program renderer/publication model, add built-in template selection, and deliver a production MVP Simple Mode editor for sacrament programs.

**Architecture:** The new feature uses `Document → Pages/Sheets → Regions → Blocks`, with `SACRAMENT_PROGRAM` as the only registered document type. Meeting-specific layouts are mutable drafts in `meeting_document`; templates are immutable versioned records; publication continues to create immutable `meeting_program_render` snapshots and stable `/p/{meetingToken}` URLs. The existing `public_program_layout` and `buildMeetingRenderHtml()` remain compatibility paths until later milestones prove parity and migration safety.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict mode, PostgreSQL, Drizzle schema definitions plus forward SQL migrations, Zod, Vitest/jsdom, existing Auth.js/RBAC/RLS/audit patterns.

**Current repository facts used by this plan:**

- The web app is in `apps/web` and uses co-located `.vitest.ts`/`.vitest.tsx` tests.
- The latest migration currently present is `apps/web/drizzle/0062_offline_mutation_meeting_scope.sql`; the first new migration should therefore be `0063_...sql`.
- Existing layout state is `public_program_layout`, represented by `apps/web/src/meetings/public-layout.ts` and edited at `/settings/public-layout`.
- Existing rendering is `apps/web/src/meetings/render.ts`; authenticated print is `/meetings/[meetingId]/print`; publication is `/api/w/[wardId]/meetings/[meetingId]/publish`.
- Existing public snapshots are stored in `meeting_program_render` and served by `/p/[meetingToken]` and `/p/ward/[portalToken]`.
- Existing meeting management uses `canManageMeetings()` in `apps/web/src/auth/roles.ts`. `PROGRAM_EDITOR` must not be added to that helper.
- Existing RLS integration coverage is represented by `apps/web/src/db/ward-user-role-rls.vitest.ts`; SQL policies use `app.current_ward_id()` in recent migrations.

---

## Scope and non-goals for Milestones 1–4

Included:

- Typed generic document/layout/block model.
- `SACRAMENT_PROGRAM` block registry.
- Dedicated `PROGRAM_EDITOR` role and granular program permissions.
- Template/version/document/ward-settings persistence.
- RLS and ward/stake/system read/write boundaries for the foundation tables.
- Compatibility renderer that can render the existing three presets through the new document model without changing current public output contracts.
- Eight-to-twelve built-in template definitions, with the existing three presets mapped to named built-ins.
- Authorized template gallery and copying a usable template into a ward-owned template.
- Simple Mode editing of an inherited meeting document: enable/disable permitted blocks, reorder blocks, edit safe block settings, choose a curated theme, live preview, debounced auto-save, revision conflict handling, and draft/public preview separation.

Explicitly deferred to later milestones:

- Advanced drag/drop, arbitrary region authoring, columns, snapping, resizing, blank layouts, and undo/redo UI.
- Media upload/storage/library and image processing. Milestone 4 may retain the existing authorized HTTPS cover-image compatibility field only; it must not claim managed upload support.
- Deterministic PDF generation, print overflow engine, folded preview, and PDF download implementation.
- Publication history/rollback/expiration/validation panel enhancements.
- Stake/system administration UI beyond safe availability of built-in/shared templates.
- Baptism, funeral, or any second document type.

---

# Milestone 1 — Foundation: schema, registry, permissions, and isolation

**Outcome:** The repository has a validated generic document model and secure persistence primitives, but no large visual designer yet.

### Task 1. Add typed document-designer domain types

**Files:**

- Create: `apps/web/src/document-designer/types.ts`
- Create: `apps/web/src/document-designer/schema.ts`
- Create: `apps/web/src/document-designer/constants.ts`
- Test: `apps/web/src/document-designer/schema.vitest.ts`

Define discriminated types for:

- `DocumentType = 'SACRAMENT_PROGRAM'`.
- Paper/orientation/fold values supported by the initial model: `LETTER`, `A4`; `PORTRAIT`, `LANDSCAPE`; `NONE`, `BIFOLD`, `TRIFOLD`, `HALF_SHEET`.
- `DocumentLayout`, `DocumentPage`, `DocumentRegion`, `DocumentBlock`.
- Block widths `FULL`, `TWO_THIRDS`, `HALF`, `ONE_THIRD`.
- Data modes `AUTO`, `AUTO_OVERRIDE`, `MANUAL`.
- Visibility/print/digital behavior values needed by Simple Mode.
- Template scope/status/lock values.

Use Zod schemas at the persistence boundary. Reject unknown block types, unsupported paper/fold combinations, invalid ratios/gutters, invalid block widths, oversized configuration, and schema versions that are not explicitly supported. Do not use `Record<string, unknown>` as the public production type for blocks; use a discriminated block union plus narrowly typed config shapes.

**Tests:** valid sacrament layouts parse; unknown block types, malformed IDs, unsafe links, unsupported values, invalid theme fonts, and oversized/unknown configuration fail; a minimal default layout parses.

### Task 2. Add the typed document-type/block registry

**Files:**

- Create: `apps/web/src/document-designer/registry.ts`
- Create: `apps/web/src/document-designer/sacrament-program.ts`
- Test: `apps/web/src/document-designer/registry.vitest.ts`

Register `SACRAMENT_PROGRAM` with the initial catalog:

`DOCUMENT_TITLE`, `WARD_NAME`, `MEETING_INFO`, `MEETING_PROGRAM`, `PRESIDING_CONDUCTING`, `MUSIC_LEADERS`, `SPEAKERS`, `WARD_STAKE_BUSINESS`, `WARD_LEADERSHIP`, `MISSIONARIES_SERVING`, `MISSIONARIES_ASSIGNED`, `WARD_CONTACT`, `BUILDING_INFO`, `SERVICE_TIMES`, `ANNOUNCEMENTS`, `UPCOMING_EVENTS`, `CALENDAR`, `THIS_WEEK`, `SUNDAY_LESSONS`, `YOUTH_ACTIVITIES`, `PRIMARY_ACTIVITIES`, `TEMPLE_INFO`, `SCRIPTURE`, `QUOTE`, `CUSTOM_TEXT`, `IMAGE`, `DIVIDER`, `SPACER`, `QR_CODE`, and `CUSTOM_LINK`.

Each definition must declare allowed data modes, Simple/Advanced exposure, publication-safety classification, default configuration, supported targets, and validation. The registry must be dependency-light and must not import database code or client-only modules. The registry must preserve the rule that `MEETING_PROGRAM` consumes the existing ordered `meeting_program_item` sequence rather than requiring each hymn/speaker to become a separate layout block.

**Tests:** registry completeness; every block has a safety classification and validator; `MEETING_PROGRAM` is registered as the aggregate program block; no baptism/funeral block is registered; public-safe and internal-only classifications are distinct.

### Task 3. Add the dedicated Program Editor role and permission helpers

**Files:**

- Modify: `apps/web/src/auth/roles.ts`
- Modify: `apps/web/src/auth/roles.vitest.ts`
- Modify: `apps/web/src/auth/navigation.ts`
- Modify: `apps/web/src/auth/navigation.vitest.ts`
- Modify: `apps/web/src/db/schema.ts`
- Create: `apps/web/drizzle/0063_program_editor_role.sql`

Add `PROGRAM_EDITOR` to `WARD_ROLES` and seed it as a ward-scoped role in the migration. Add narrow helpers:

- `canViewProgramDesigner(session, wardId)`
- `canEditProgramDesign(session, wardId)`
- `canManageWardProgramTemplates(session, wardId)`
- `canManageProgramMedia(session, wardId)` (foundation helper only; media routes remain later scope)
- `canPublishProgram(session, wardId)`
- `canUseAdvancedProgramDesigner(session, wardId)`

Use the existing high-privilege roles intentionally, but do not modify `canManageMeetings()` to include `PROGRAM_EDITOR`. The role must not gain calling, membership, internal-note, import, user/role-management, or general meeting-edit permissions merely by being assigned.

Navigation changes in this task should only establish the authorization shape. Do not expose unfinished designer routes. Add positive and negative navigation tests for a program-only user once the Programs entry is introduced in Milestone 3.

**Tests:** `PROGRAM_EDITOR` can satisfy program-view/edit helpers only in its active ward; it cannot satisfy `canManageMeetings`, `canManageCallings`, `canUseInternalNotes`, `canRunImports`, or ward-user management; high-level existing roles retain program access; wrong active ward always fails; publish permission is independently controlled.

### Task 4. Add template, version, meeting-document, and ward-settings tables

**Files:**

- Create: `apps/web/drizzle/0064_document_designer_foundation.sql`
- Modify: `apps/web/src/db/schema.ts`
- Create: `apps/web/src/document-designer/persistence.ts`
- Test: `apps/web/src/document-designer/persistence.vitest.ts`

Add these tables, with explicit constraints and indexes:

- `document_template`: `id`, `scope_type` (`SYSTEM`, `STAKE`, `WARD`, `PERSONAL_DRAFT`), nullable `scope_id`, `document_type`, `name`, `description`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), nullable `current_published_version_id`, `created_by_user_id`, `created_at`, `updated_at`.
- `document_template_version`: `id`, `template_id`, `version`, `schema_version`, `layout_json`, `theme_json`, `lock_json`, `created_by_user_id`, `created_at`; unique `(template_id, version)`.
- `meeting_document`: `id`, `ward_id`, `meeting_id`, `document_type`, nullable `source_template_id`, nullable `source_template_version`, `schema_version`, `layout_json`, `theme_json`, `revision`, `updated_by_user_id`, `updated_at`; unique `(ward_id, meeting_id, document_type)`.
- `ward_document_settings`: `ward_id` primary key, nullable `default_sacrament_template_id`, `allow_advanced_program_designer`, nullable `public_program_expiration_days` reserved for later behavior, `updated_by_user_id`, `updated_at`.

Use ward-safe foreign keys where applicable. Do not make `current_published_version_id` a circular hard dependency that prevents inserting a template/version; add the FK after table creation or use a nullable FK in a follow-up statement. Store only validated JSONB, never raw generated HTML as the source of truth.

Add `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` where consistent with current tables, and explicit policies. Ward-owned rows must be limited by `app.current_ward_id()`. Stake/system templates are readable only through explicit application authorization and must not be writable by ward users. Include indexes for ward/meeting lookup, scope/status/document type, and published template selection.

**Tests:** persistence round trips preserve layout IDs and schema version; duplicate document/template versions fail; one meeting cannot have two sacrament documents; ward settings default safely when absent; cross-ward RLS integration test is skipped only when no `TEST_DATABASE_URL`/`DATABASE_URL` is available, matching `ward-user-role-rls.vitest.ts` conventions.

### Task 5. Add ward program settings route and audit contract

**Files:**

- Create: `apps/web/app/api/w/[wardId]/program-settings/route.ts`
- Create: `apps/web/app/api/w/[wardId]/program-settings/route.vitest.ts`
- Modify: `apps/web/src/audit/service.ts` only if a typed action constant is needed

Implement `GET` for the current ward's program settings and `PATCH` for `allowAdvancedProgramDesigner` and the independently controlled publish/prepare permissions. If the existing schema has no suitable permission columns, add them to `ward_document_settings` in the same forward migration rather than silently storing UI-only state. Enforce active-ward context, `STAND_ADMIN` authorization for settings changes, Zod payload validation, stable error codes, transaction-local RLS context, and audit logging.

Do not implement expiration behavior or media settings in this milestone; either omit those fields from the API or return their documented default without claiming support.

**Tests:** unauthenticated, wrong-ward, non-admin, malformed payload, database rejection, successful read/write, audit event, and persisted false-value readback.

### Milestone 1 verification gate

Run from repository root:

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test --workspace @the-stand/web -- --run src/document-designer apps/web/src/auth/roles.vitest.ts
npm run typecheck --workspace @the-stand/web
npm run lint --workspace @the-stand/web
npm run build --workspace @the-stand/web

git diff --check
```

Also run the database-backed RLS tests when a disposable PostgreSQL URL is available. Update `docs/SCHEMA.md`, `docs/API.md`, and `docs/ARCHITECTURE.md` with only the verified Milestone 1 model and routes.

---

# Milestone 2 — Generic renderer and compatibility layer

**Outcome:** The new document model can render a sacrament program for digital and print-oriented HTML while existing public output and publication behavior remain intact.

### Task 6. Create data-resolution and public-safety boundaries

**Files:**

- Create: `apps/web/src/document-designer/data-resolver.ts`
- Create: `apps/web/src/document-designer/public-safety.ts`
- Create: `apps/web/src/document-designer/render-types.ts`
- Test: `apps/web/src/document-designer/data-resolver.vitest.ts`
- Test: `apps/web/src/document-designer/public-safety.vitest.ts`

Define the resolved block-data shape separately from database rows. The resolver may expose meeting date/type, public program items, approved announcements/events, public leadership fields, and explicitly included contact fields only. It must not return internal notes, calling proposals, membership/ordinance data, interview substance, private contacts, or unpublished assignments.

Enforce each block’s publication classification server-side. A block that references `INTERNAL_ONLY` data must fail public resolution/publication even if the browser submits it. Keep custom text as structured safe content; do not introduce arbitrary HTML/CSS/JS.

### Task 7. Implement the generic document renderer

**Files:**

- Create: `apps/web/src/document-designer/renderer.ts`
- Create: `apps/web/src/document-designer/block-renderers.ts`
- Create: `apps/web/src/document-designer/renderer.vitest.ts`
- Modify: `apps/web/src/meetings/render.ts`
- Modify: `apps/web/src/meetings/render.vitest.ts`

Implement `renderDocumentHtml()` with separate stages:

1. Resolve/validate document input.
2. Resolve pages, regions, columns, and block visibility.
3. Render each block through registry-defined print/digital renderers.
4. Compose semantic digital HTML and print CSS.
5. Return HTML plus non-sensitive render metadata/warnings.

The initial renderer may delegate existing meeting-program content to the current rendering helpers, but the compatibility wrapper must accept a `DocumentLayout` and keep `buildMeetingRenderHtml()` callable for existing callers. Preserve existing escaping, QR generation, localized labels, announcement filtering, speaker topics, sacrament-prayer behavior, and text-first image defaults.

Digital output must not reproduce fold geometry; it must use logical reading order. Print output may use the current preset CSS while the new model is being proven. Do not introduce PDF generation in this milestone.

**Tests:** renderer output for each built-in layout shape; logical digital order; `hideWhenEmpty`; `PRINT_ONLY`/`DIGITAL_ONLY`; public-safety rejection; HTML escaping; QR URL escaping/labels; announcement filtering; speaker topics; current print fixture parity.

### Task 8. Add a compatibility adapter from the three existing presets

**Files:**

- Create: `apps/web/src/document-designer/legacy-layout-adapter.ts`
- Test: `apps/web/src/document-designer/legacy-layout-adapter.vitest.ts`
- Modify: `apps/web/src/meetings/public-layout.ts`
- Modify: `apps/web/src/meetings/public-layout.vitest.ts`

Map:

- `SINGLE_SHEET_BIFOLD` → `Classic Bifold`
- `TRI_FOLD_BULLETIN` → `Trifold Bulletin`
- `FULL_PAGE` → `Full Page Standard`

Map `announcement_mode` and the existing authorized cover-image metadata into the new document structure without deleting or rewriting `public_program_layout`. The adapter must be deterministic and preserve current defaults. Keep old preset values accepted for rollback and existing records.

**Tests:** all three mappings; missing `public_program_layout` fallback; round-trip of announcement mode and authorized cover metadata; no mutation of legacy settings.

### Task 9. Route existing print and publication through the compatibility renderer

**Files:**

- Modify: `apps/web/app/meetings/[meetingId]/print/page.tsx`
- Modify: `apps/web/app/api/w/[wardId]/meetings/[meetingId]/publish/route.ts`
- Modify: `apps/web/app/p/[meetingToken]/route.ts` only if snapshot metadata/headers require a safe additive change
- Modify: `apps/web/app/p/ward/[portalToken]/route.ts` only if needed for the same compatibility contract
- Tests: existing print/publish/public route tests plus new `apps/web/src/document-designer/compatibility-render.vitest.ts`

For draft print, resolve `meeting_document` when present and otherwise adapt the legacy ward layout. For publication, resolve the meeting document/legacy fallback through the same renderer, then continue inserting immutable `meeting_program_render` HTML and stable `public_program_share` token behavior. Do not replace the public route with live draft rendering. Do not change public token format or expose `ward_id` in public URLs.

Add explicit database failure handling and stable `INTERNAL_ERROR` responses for new read paths. Update route mocks immediately for each new query and add no-document/no-settings fallback tests.

**Tests:** draft render uses meeting document; legacy fallback remains unchanged; publication creates a new immutable render; republish reuses the existing share token; public routes serve stored snapshot only; internal fields are absent; DB rejection returns stable error behavior; current print/public snapshots continue passing.

### Milestone 2 verification gate

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test --workspace @the-stand/web -- --run src/document-designer apps/web/src/meetings apps/web/app/api/w/'[wardId]'/meetings/'[meetingId]'/publish
npm run typecheck --workspace @the-stand/web
npm run lint --workspace @the-stand/web
npm run build --workspace @the-stand/web

git diff --check
```

Update `docs/ARCHITECTURE.md`, `docs/API.md`, and `docs/SCHEMA.md` with the compatibility path and explicitly document that `public_program_layout` remains active.

---

# Milestone 3 — Built-in templates and template gallery

**Outcome:** Authorized users can see available built-in/shared templates, select a template for a meeting, and copy a permitted template into a ward-owned template without mutating the source.

### Task 10. Define built-in template catalog and seed/installation path

**Files:**

- Create: `apps/web/src/document-designer/built-in-templates.ts`
- Create: `apps/web/src/document-designer/template-catalog.vitest.ts`
- Create: `apps/web/drizzle/0065_program_designer_builtin_templates.sql` if built-ins are persisted as rows
- Modify: `apps/web/src/db/schema.ts` only for any seed metadata fields required by the chosen approach
- Modify: `apps/web/scripts/migrate.mjs` only if the repository’s migration runner requires explicit seed handling

Provide approximately eight initial templates, including the three compatibility mappings:

- Classic Bifold
- Trifold Bulletin
- Full Page Standard
- Modern Minimal
- Compact One Page
- Large Print
- Image Cover (metadata-only until media milestone)
- Announcement Focus

Additional candidates such as Half Sheet, Mobile First, or Simple Formal may be added only if they do not expand the implementation scope. Every template needs a stable key, name, description, thumbnail reference/placeholder contract, format metadata, document type, default layout/theme, and source classification.

Prefer deterministic application-owned built-in definitions plus idempotent persistence. If rows are inserted, use stable keys and `ON CONFLICT DO NOTHING`; never duplicate templates on repeated migrations. Built-ins are not ward-owned and cannot be edited directly by ward users.

**Tests:** catalog count and required names; all templates validate; compatibility keys map correctly; seed is idempotent; no built-in template contains internal-only blocks by default.

### Task 11. Add template query/copy/version APIs

**Files:**

- Create: `apps/web/app/api/w/[wardId]/document-templates/route.ts`
- Create: `apps/web/app/api/w/[wardId]/document-templates/route.vitest.ts`
- Create: `apps/web/app/api/w/[wardId]/document-templates/[templateId]/route.ts`
- Create: `apps/web/app/api/w/[wardId]/document-templates/[templateId]/duplicate/route.ts`
- Create: `apps/web/app/api/w/[wardId]/document-templates/[templateId]/versions/route.ts`
- Create: `apps/web/app/api/w/[wardId]/document-templates/[templateId]/publish/route.ts` (foundation contract; full admin workflow remains limited)

Implement:

- `GET /api/w/{wardId}/document-templates`: available published built-ins, authorized stake/ward templates, and current-user personal drafts; filter by `SACRAMENT_PROGRAM` and status.
- `POST /api/w/{wardId}/document-templates`: create a ward/personal draft only for an authorized caller; validate the complete version/layout.
- `GET /api/w/{wardId}/document-templates/{templateId}`: return metadata and permitted version history.
- `POST /api/w/{wardId}/document-templates/{templateId}/duplicate`: copy a readable source into a new ward-controlled draft, preserving no source write capability.
- `POST /api/w/{wardId}/document-templates/{templateId}/versions`: create a new draft version from an authorized editable template.
- `POST /api/w/{wardId}/document-templates/{templateId}/publish`: publish only where the caller has the appropriate ward-template permission; immutable version semantics and audit logging are required.

Use explicit source-scope and ward authorization checks in every handler. A ward may read an authorized system/stake template but cannot update it. Add stable error codes and DB rejection tests.

### Task 12. Add template gallery and Programs landing route

**Files:**

- Create: `apps/web/app/programs/page.tsx`
- Create: `apps/web/app/programs/programs-client.tsx`
- Create: `apps/web/app/programs/programs-client.vitest.tsx`
- Create: `apps/web/app/programs/templates/page.tsx`
- Create: `apps/web/app/programs/templates/template-gallery-client.tsx`
- Create: `apps/web/app/programs/templates/template-gallery-client.vitest.tsx`
- Modify: `apps/web/src/auth/navigation.ts`
- Modify: `apps/web/src/auth/navigation.vitest.ts`
- Modify: `apps/web/components/app-navigation.tsx` only if the current shell needs a role-aware label/link adjustment

`/programs` is the restricted upcoming-program landing page. It should list upcoming meetings with program status and actions available to the current permission set. `/programs/templates` shows Built-In Templates, Stake Templates, Ward Templates, and My Drafts. Cards must include name, description, paper/format metadata, and thumbnail/placeholder. Do not add a second competing public-layout settings UI.

Use semantic controls and existing component-test conventions. Program-only users should see Programs and not unrelated calling/member/admin navigation. Do not make hidden UI controls the authorization boundary.

**Tests:** page/navigation visibility for PROGRAM_EDITOR only; role exclusion of calling/membership/import links; gallery sections; duplicate/copy button permission visibility; failed load/save states; keyboard-accessible template cards.

### Task 13. Add template selection/inheritance to new meetings and existing meetings

**Files:**

- Modify: `apps/web/app/api/w/[wardId]/meetings/route.ts`
- Modify: `apps/web/app/api/w/[wardId]/meetings/[meetingId]/route.ts` only where meeting creation/update currently owns program initialization
- Modify: meeting creation/default-program code found by tracing `apps/web/src/meetings/default-program.ts` and its callers
- Create: `apps/web/src/document-designer/inheritance.ts`
- Test: `apps/web/src/document-designer/inheritance.vitest.ts`
- Test: affected meeting route tests

When a new sacrament meeting is created, select the current published ward default; if no default exists, use `Full Page Standard`/legacy-compatible fallback. Copy the template version into `meeting_document` so later template updates do not mutate existing meetings. Existing meetings get a document lazily through the compatibility adapter or an explicit initialization path; do not rewrite all historical meetings in one migration.

Expose “newer template version available” as read-only metadata. Do not implement structural merge. Provide “keep current layout” and “update from template” only when the actual update mutation is implemented and tested; otherwise leave update action deferred rather than rendering a nonfunctional button.

**Tests:** new meeting inherits the published version; existing meeting remains stable after template update; no-default fallback; cross-ward/default-template authorization; duplicate initialization is idempotent; no unrelated meeting fields change.

### Milestone 3 verification gate

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test --workspace @the-stand -- --run src/document-designer apps/web/app/programs apps/web/app/api/w/'[wardId]'/document-templates
npm run typecheck --workspace @the-stand/web
npm run lint --workspace @the-stand/web
npm run build --workspace @the-stand/web

git diff --check
```

Update `docs/API.md`, `docs/UI.md`, `docs/SCHEMA.md`, and `docs/PLANS.md` with the verified routes, template scopes, and inheritance behavior. Do not mark Advanced Mode, media, or PDF work complete.

---

# Milestone 4 — Simple Mode editor, live preview, and auto-save

**Status: implemented in the current working tree.** The authenticated `/programs/{meetingId}` editor now loads/initializes a ward-scoped `meeting_document`, exposes locked Simple Mode block/theme controls, renders digital/phone/print previews through the shared renderer, supports public-safe preview validation, debounces PUT autosave with revision checks, preserves local edits on conflicts/errors, and keeps publishing separate. Advanced Mode, media management, deterministic PDF generation, and publishing enhancements remain deferred.

**Outcome:** A normal authorized ward user can open a meeting’s Program Designer, choose/use an approved template, enable/disable permitted blocks, reorder blocks, edit safe settings/content, preview digital/print-oriented output, and save draft changes without publishing them.

### Task 14. Add program-design route authorization and persistence contract

**Files:**

- Create: `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-design/route.ts`
- Create: `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-design/route.vitest.ts`
- Create: `apps/web/src/document-designer/meeting-document-service.ts`
- Test: `apps/web/src/document-designer/meeting-document-service.vitest.ts`

Implement:

- `GET /api/w/{wardId}/meetings/{meetingId}/program-design`: return the validated meeting document, source template metadata, revision, allowed Simple Mode properties, and a public-safe preview input or preview URL contract.
- `PUT /api/w/{wardId}/meetings/{meetingId}/program-design`: accept the complete validated draft document plus `expectedRevision`; reject stale revisions with a stable conflict response and never silently overwrite another browser session.
- `POST /api/w/{wardId}/meetings/{meetingId}/program-design/validate`: run server-authoritative validation for the draft without publishing.

Use `canViewProgramDesigner`, `canEditProgramDesign`, and `canUseAdvancedProgramDesigner`; do not use `canManageMeetings()` as a shortcut. Verify the meeting belongs to the active ward, the source template/version is readable, all block types are registered, lock rules are enforced server-side, and public-safety classifications are respected. Save layout/theme JSON and increment `revision` atomically. Record audit events for meaningful saves, not every drag keystroke.

**Tests:** auth/ward isolation; PROGRAM_EDITOR read/write; non-program privileges excluded; malformed layout; unknown block; locked property/structure; stale revision conflict; DB read/write rejection; successful revision increment; no publication side effect; internal-only block rejection; meeting-not-found.

### Task 15. Build the Simple Mode editor state and client shell

**Files:**

- Create: `apps/web/app/programs/[meetingId]/page.tsx`
- Create: `apps/web/app/programs/[meetingId]/program-designer-client.tsx`
- Create: `apps/web/app/programs/[meetingId]/program-designer-client.vitest.tsx`
- Create: `apps/web/app/programs/[meetingId]/designer-state.ts`
- Test: `apps/web/app/programs/[meetingId]/designer-state.vitest.ts`
- Modify: `apps/web/app/programs/programs-client.tsx` to link into the designer

The page must enforce the same program-specific permission server-side. The client shell uses the requested desktop structure: block sidebar, document canvas, properties sidebar. In Milestone 4, the left sidebar exposes approved blocks and template choices; the canvas renders the logical document; the right sidebar exposes only Simple Mode-safe properties.

Required controls:

- Edit / Desktop / Phone / Print Preview mode tabs or equivalent.
- Template selection from permitted gallery entries.
- Block enable/disable where the template permits it.
- Reorder controls using keyboard-accessible move actions; drag/drop can be added only if it does not become the only interaction path.
- Safe theme selection and density/heading options.
- Meeting Program display variants and supported toggles such as presiding/conducting, music leaders, hymn numbers/titles, speaker topics, and hide-empty-items.
- Custom text through a structured schema only.
- Visible `Saving…`, `Saved`, `Save failed`, and conflict/reload states.
- Preview as public visitor must use public-safe data and must not display editor controls or internal fields.
- Publish remains a separate action and is not triggered by save.

Do not implement Advanced Mode controls in this milestone. If the ward setting disables Advanced Mode, no advanced controls or Blank Layout appear; if enabled, show an explicit deferred/disabled state until Milestone 5 rather than pretending the controls work.

### Task 16. Implement debounced auto-save and conflict-safe client behavior

**Files:**

- Modify: `apps/web/app/programs/[meetingId]/program-designer-client.tsx`
- Modify: `apps/web/app/programs/[meetingId]/designer-state.ts`
- Test: `apps/web/app/programs/[meetingId]/program-designer-client.vitest.tsx`

Use initial-state protection so initial load does not save. Debounce changes, coalesce reorder/property edits, send the current `expectedRevision`, and update the local revision only after a successful response. On `409` revision conflict, stop automatic writes, retain unsaved local state, show the server/local comparison or reload action, and never silently discard work. On network/database failure, show retryable status and preserve the draft in memory; do not claim offline durable editing unless a later offline design is implemented.

Verify that block IDs remain stable across reorder and that saving a layout does not mutate meeting program-item records. Keep publication separate: auto-save only updates `meeting_document`.

**Tests:** initial render causes no PUT; one debounced save after multiple changes; status transitions on success/failure; retry; stale revision conflict; stable IDs after reorder; explicit payload includes schema/document type/layout/theme/revision; no publish request; public preview excludes internal fields; save button/status is accessible and recovers after failure.

### Task 17. Add live preview integration with the generic renderer

**Files:**

- Create: `apps/web/app/programs/[meetingId]/preview.tsx` or keep preview as a focused component in `program-designer-client.tsx` if no server boundary is needed
- Create: `apps/web/src/document-designer/preview-contract.ts`
- Test: `apps/web/src/document-designer/preview-contract.vitest.ts`
- Modify: `apps/web/src/document-designer/renderer.ts` only if preview and publication currently diverge

Use the same normalized layout input for draft preview and later publication. Digital preview must use responsive logical order; print preview must apply the selected paper/orientation/fold class without claiming deterministic PDF output. Preview data must pass through the public-safe resolver when using “Preview as Public Visitor.”

**Tests:** the same draft input produces deterministic preview output; hidden empty blocks are omitted; public preview excludes private fields; print/digital mode changes target media behavior only; supported built-in templates render; long text produces a validation warning rather than silent font shrinking.

### Task 18. Wire meeting/program navigation and preserve legacy settings

**Files:**

- Modify: `apps/web/src/auth/navigation.ts`
- Modify: `apps/web/src/auth/navigation.vitest.ts`
- Modify: `apps/web/app/meetings/[meetingId]/edit/page.tsx` to add a permission-gated Program Designer link, not duplicate editor controls
- Modify: `apps/web/app/settings/public-layout/page.tsx` only to link/label the compatibility path if appropriate
- Modify: `apps/web/app/settings/public-layout/public-layout-client.tsx` only if a deprecation notice/link is needed
- Test: affected page/component tests

Make `/programs` the workflow owner. The meeting editor keeps a contextual link to the designer but does not duplicate block editing or template lifecycle controls. Preserve `/settings/public-layout` for legacy compatibility until a later migration milestone; do not remove or silently reinterpret its saved data.

**Tests:** program-only role sees Programs and meeting designer link but not unrelated meeting-management controls; users without program permission do not see or access the designer; legacy public-layout settings remain readable and still affect fallback rendering.

### Milestone 4 verification gate

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test --workspace @the-stand/web -- --run src/document-designer apps/web/app/programs apps/web/app/api/w/'[wardId]'/meetings/'[meetingId]'/program-design
npm run test:components --workspace @the-stand/web
npm run typecheck --workspace @the-stand/web
npm run lint --workspace @the-stand/web
npm run build --workspace @the-stand/web

git diff --check
```

If a disposable PostgreSQL instance is available, run the route/RLS integration suite against it. Browser E2E is a separate gate: provide an isolated database, migrations, auth/bootstrap variables, and the configured Playwright server before claiming browser coverage. Add E2E only under the repository’s configured Playwright `testDir`, likely `apps/web/e2e/`, with a disposable PROGRAM_EDITOR fixture and at least two wards.

Update `docs/API.md`, `docs/UI.md`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`, and `docs/PLANS.md` to record the implemented Simple Mode scope and explicitly list Advanced Mode, media, PDF, publishing-enhancement, and migration work as remaining.

---

# Cross-milestone test matrix

**Schema/domain:**

- `apps/web/src/document-designer/schema.vitest.ts`
- `apps/web/src/document-designer/registry.vitest.ts`
- `apps/web/src/document-designer/public-safety.vitest.ts`
- `apps/web/src/document-designer/inheritance.vitest.ts`
- `apps/web/src/document-designer/renderer.vitest.ts`
- `apps/web/src/document-designer/template-catalog.vitest.ts`
- `apps/web/src/document-designer/meeting-document-service.vitest.ts`

**Authorization/navigation:**

- `apps/web/src/auth/roles.vitest.ts`
- `apps/web/src/auth/navigation.vitest.ts`
- New route tests for settings, templates, and program design.

**Persistence/RLS:**

- `apps/web/src/document-designer/persistence.vitest.ts`
- `apps/web/src/db/ward-user-role-rls.vitest.ts` extended or a focused `apps/web/src/db/document-designer-rls.vitest.ts`
- Use a real disposable PostgreSQL database for RLS evidence; skipped tests are not a successful RLS result.

**Renderer/publication compatibility:**

- Existing `apps/web/src/meetings/render.vitest.ts`
- Existing `apps/web/src/meetings/print-fixtures.vitest.ts`
- Existing `apps/web/app/api/w/[wardId]/meetings/[meetingId]/publish/route.vitest.ts`
- Existing `apps/web/app/p/[meetingToken]/route.vitest.ts`
- Existing `apps/web/app/p/ward/[portalToken]/route.vitest.ts`
- New compatibility adapter and public-safety tests.

**UI:**

- `apps/web/app/programs/programs-client.vitest.tsx`
- `apps/web/app/programs/templates/template-gallery-client.vitest.tsx`
- `apps/web/app/programs/[meetingId]/program-designer-client.vitest.tsx`
- Verify semantic labels, keyboard reorder, save status/live region, disabled/deferred advanced controls, and error recovery. Do not use CSS-only assertions as proof of visual behavior.

**E2E, when infrastructure is ready:**

- `apps/web/e2e/program-designer.spec.ts`
- `apps/web/e2e/program-editor-permissions.spec.ts`
- Scenarios: choose template, create meeting inheritance, edit/reorder/save, reload persistence, public-safe preview, publish separation, cross-ward denial, and program-only navigation.

---

# Required route and table inventory after Milestone 4

**New authenticated pages:**

- `/programs`
- `/programs/templates`
- `/programs/{meetingId}`

**New authenticated API routes:**

- `GET/PATCH /api/w/{wardId}/program-settings`
- `GET/POST /api/w/{wardId}/document-templates`
- `GET /api/w/{wardId}/document-templates/{templateId}`
- `POST /api/w/{wardId}/document-templates/{templateId}/duplicate`
- `POST /api/w/{wardId}/document-templates/{templateId}/versions`
- `POST /api/w/{wardId}/document-templates/{templateId}/publish`
- `GET/PUT /api/w/{wardId}/meetings/{meetingId}/program-design`
- `POST /api/w/{wardId}/meetings/{meetingId}/program-design/validate`

**Existing routes deliberately preserved:**

- `/settings/public-layout`
- `/meetings/{meetingId}/print`
- `POST /api/w/{wardId}/meetings/{meetingId}/publish`
- `/p/{meetingToken}`
- `/p/ward/{portalToken}`

**New/changed tables:**

- `document_template`
- `document_template_version`
- `meeting_document`
- `ward_document_settings`
- Existing `role` seed for `PROGRAM_EDITOR`
- Existing `ward_feature_settings` is not replaced; program settings belong in `ward_document_settings`.

**Not changed in Milestones 1–4:**

- `public_program_layout` remains active for compatibility.
- `meeting_program_render` remains the immutable HTML snapshot table.
- `public_program_share` remains the stable meeting token table.
- No `media_asset` table or upload route yet.
- No PDF binary generation yet.

# Completion rule

Do not advance a milestone because its files exist or the build passes. Advance only when the named routes, permissions, schema constraints, tests, and fallback behavior have been exercised. Report unit/component, route, RLS, build, and browser evidence separately. A successful build does not prove ward isolation, publication safety, auto-save conflict handling, or public rendering behavior.
