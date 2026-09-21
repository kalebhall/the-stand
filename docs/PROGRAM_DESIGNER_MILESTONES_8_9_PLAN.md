# Program Designer — Milestones 8–9 Implementation Plan

> **For Hermes:** This is a planning artifact. Do not implement until explicitly authorized. Use the repository's execution and review workflow task-by-task.

**Goal:** Add immutable publication history, rollback, expiration, server-authoritative pre-publish validation, and scoped stake/system template administration without breaking the existing ward program designer or public snapshot architecture.

**Architecture:** Keep `meeting_program_render` as the immutable publication history. Add an explicit active-publication pointer instead of deriving the public version with `MAX(version)`. Keep public routes token-only, read-only, noindex, and backed by the selected immutable render. Extend the existing `document_template` / `document_template_version` JSONB model for stake/system administration and enforce scope, locks, and permissions server-side.

**Tech Stack:** Next.js App Router, React 19, strict TypeScript, raw `pg` queries, Drizzle schema declarations, PostgreSQL 15+ RLS/FORCE RLS, Zod, Vitest, jsPDF, Playwright, existing audit service.

---

## 1. Current repository facts

- Repository: `/root/workspaces/the-stand`
- Current branch: `feat/program-designer-milestone-5`
- Current committed head: `c3b2aed feat(program-designer): add milestone 7 print and PDF output`
- Working tree was clean during planning inspection.
- Latest migration present: `apps/web/drizzle/0077_published_print_input_immutability.sql`
- Next migration number: `0078`.
- Existing publication source:
  - `meeting_program_render` stores immutable `render_html`, `version`, and Milestone 7 structured `layout_json` / `render_data_json`.
  - `public_program_share` provides the stable meeting token.
  - `/p/[meetingToken]` and `/p/ward/[portalToken]` serve stored HTML snapshots.
- Existing template source:
  - `document_template` supports `SYSTEM`, `STAKE`, `WARD`, and `PERSONAL_DRAFT` scope values.
  - `document_template_version` stores immutable version rows with `layout_json`, `theme_json`, and `lock_json`.
  - Existing routes list/read templates, create versions, publish ward templates, and duplicate templates.
  - Existing built-ins are seeded by `0065_program_designer_builtin_templates.sql` and also represented in `src/document-designer/built-in-templates.ts`.
- Existing ward settings already contain:
  - `default_sacrament_template_id`
  - Program Editor publish/republish/rollback flags
  - `public_program_expiration_days`
  - Advanced/template/media permission flags
- Existing program-specific role helpers exist in `apps/web/src/auth/roles.ts`.
- There is no current `STAKE_ADMIN` role or stake-scoped user assignment table. Milestone 9 must not pretend that ward roles or global support roles are equivalent to stake administration.
- Existing public routes currently select the newest render by version/order. Milestone 8 must replace that behavior with an explicit active render pointer while preserving old rows and stable tokens.

## 2. Scope and non-goals

### In scope

- Milestone 8:
  - server-authoritative publication validation;
  - publication metadata and history;
  - explicit active-version selection;
  - authorized rollback without mutating history;
  - ward-level public expiration enforcement;
  - noindex/nofollow public responses;
  - publication-history UI and validation UI;
  - immutable published PDF/public HTML behavior after rollback or later draft edits.
- Milestone 9:
  - stake-scoped administration;
  - system-template administration;
  - scope-aware template creation, editing, publishing, archiving, copying, and history;
  - template lock policy enforcement;
  - required/use-as-is/duplicate-and-customize policy representation;
  - stake/system template gallery and administration UI;
  - audit coverage and cross-scope isolation tests.
- Final reviews and verification gates for both milestones.

### Explicitly out of scope

- Baptism, funeral, or any second document type.
- Automatic structural merges between template versions.
- Real-time collaborative editing.
- Arbitrary HTML, CSS, JavaScript, fonts, SVG, background images, or absolute positioning.
- Deleting `public_program_layout`, `buildMeetingRenderHtml()`, `meeting_program_render`, `public_program_share`, or existing public routes.
- Public PDF routes by raw ward ID or by live draft data.
- Production data reset or destructive migration.
- Treating a passing unit test as proof of PostgreSQL RLS or deployment correctness.

## 3. Design decisions to preserve

1. **History is append-only.** A publication is a new immutable `meeting_program_render` row. Rollback changes only the active pointer and writes an audit event.
2. **Public output is pointer-based.** Public routes resolve the active render through `public_program_share.active_render_id`; they never use current draft data or `MAX(version)`.
3. **Expiration is enforced server-side.** The ward policy is read in the publication/public-route transaction. An expired public share returns the stable public not-found response, while internal history remains retained.
4. **Validation is authoritative.** The browser may display validation results, but publish routes rerun layout, public-safety, link, image, accessibility, and overflow validation inside the transaction before creating the public snapshot.
5. **Scope is explicit.** Every template query must separately model `SYSTEM`, `STAKE` with matching stake, `WARD` with matching ward, and `PERSONAL_DRAFT` owned by the current user. No broad nullable `scope_id` OR predicate.
6. **Locks are server policy.** `lock_json` is parsed and enforced by server-side helpers. UI-disabled controls are not security boundaries.
7. **No generalized permission expansion.** Do not add `PROGRAM_EDITOR` to `canManageMeetings()`. Add stake-specific permission helpers and retain existing narrow program permissions.
8. **Stable IDs remain stable.** Template IDs, template version IDs, meeting render IDs, public tokens, block IDs, and media asset IDs are never regenerated during copy, rollback, or migration except where a deliberate new resource is created.

---

# Milestone 8 — Publishing Enhancements

## M8 outcome

An authorized operator can run a server-authoritative pre-publish validation, publish a new immutable version, inspect history, select an older version as active, and see the same stable public URL resolve to the selected version. Public pages stop serving after the configured retention period and return noindex/nofollow metadata while active. Draft edits never alter a historical or active public snapshot.

## M8.1 Database and migration work

### Migration `apps/web/drizzle/0078_publication_history_and_active_pointer.sql`

Modify existing tables without replacing them:

### `meeting_program_render`

Add:

- `document_type TEXT NOT NULL DEFAULT 'SACRAMENT_PROGRAM'` with a check constraint for the currently supported document type.
- `source_template_id UUID NULL REFERENCES document_template(id) ON DELETE SET NULL`.
- `source_template_version INTEGER NULL CHECK (source_template_version IS NULL OR source_template_version > 0)`.
- `published_by_user_id UUID NULL REFERENCES user_account(id) ON DELETE SET NULL`.
- `published_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- `publication_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb` for non-sensitive renderer/template/version metadata only.
- A consistency check requiring `layout_json` and `render_data_json` to be both present for new structured publications, while preserving any explicitly identified legacy rows during migration.

Add indexes:

- `(ward_id, meeting_id, version DESC)`.
- `(ward_id, meeting_id, published_at DESC)`.
- Optional partial index for active/history inspection if query plans show need.

Enforce immutability for all publication input/output fields after insert. The existing `0077` protections must be extended to the new publication metadata and template-reference fields. Do not allow ordinary updates or deletes to historical render rows.

### `public_program_share`

Add:

- `active_render_id UUID NULL REFERENCES meeting_program_render(id) ON DELETE RESTRICT`.
- `expires_at TIMESTAMPTZ NULL`.
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

Add constraints/triggers so the active render:

- belongs to the same meeting;
- belongs to the same ward;
- is a published immutable render;
- cannot point across tenants.

Backfill `active_render_id` deterministically to the current highest valid render for each existing share. Backfill `expires_at` from `ward_document_settings.public_program_expiration_days` only where the policy can be determined without changing historical publication timestamps. Record the backfill rule in the migration comments and migration test.

### `ward_document_settings`

Keep `public_program_expiration_days` as the policy source. Add a database check for allowed policy values if the product contract is fixed to `NULL`, `30`, `60`, `90`, or a bounded positive custom value. Do not silently reinterpret existing values.

### Audit

Reuse `audit_log`; do not create a duplicate history table. Add stable action names:

- `PROGRAM_PUBLISHED`
- `PROGRAM_REPUBLISHED`
- `PROGRAM_ROLLBACK`
- `PROGRAM_PUBLIC_EXPIRATION_UPDATED`
- `PROGRAM_PUBLISH_VALIDATION_FAILED`

Audit details must contain IDs/version numbers and non-sensitive validation summaries, not rendered private data or exception text.

### Drizzle declarations

Modify:

- `apps/web/src/db/schema.ts`
  - `meetingProgramRender`
  - `publicProgramShare`
  - any new stake/template policy declarations from Milestone 9 if implemented in the same branch only after M8 is verified.

## M8.2 Publication domain/service layer

Create:

- `apps/web/src/document-designer/publication-service.ts`
  - load current authorized draft;
  - resolve template/version metadata;
  - run authoritative print/public validation;
  - build immutable public-safe render data and HTML;
  - insert the next render version under a transaction lock;
  - set or retain the active pointer explicitly;
  - calculate expiration from the ward policy;
  - return a stable publication result.
- `apps/web/src/document-designer/publication-history.ts`
  - list immutable versions;
  - validate rollback target ownership/meeting/ward;
  - select active render under row lock;
  - reject invalid or archived targets;
  - provide response DTOs that exclude private render data.
- `apps/web/src/document-designer/publication-validation.ts`
  - compose schema, lock, public-safety, custom-text, link, media, accessibility, meeting-data, and print/overflow checks;
  - classify `ERROR`, `WARNING`, and `INFO`;
  - require explicit warning acknowledgement where product policy requires it;
  - return stable error codes.

Modify:

- `apps/web/src/document-designer/meeting-document-service.ts`
  - expose explicit draft and published-source methods;
  - preserve revision checks;
  - prevent publication code from reading mutable draft data after snapshot creation.
- `apps/web/src/document-designer/print-data.ts`
  - load published data by exact render version and active pointer;
  - reject missing/malformed immutable inputs with stable internal errors.
- `apps/web/src/document-designer/public-safety.ts`
  - ensure all publication validation is server-authoritative and no internal-only block can enter a public snapshot.
- `apps/web/src/document-designer/schema.ts` and `advanced-validation.ts`
  - validate publication-time layout/theme/lock fields again rather than trusting stored or browser JSON.

## M8.3 Routes and contracts

### Existing publish route

Modify:

- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/publish/route.ts`

Behavior:

- Authenticate and validate active ward.
- Load the persisted permission profile inside the transaction.
- Distinguish first publish from republish using existing helpers.
- Run `publication-service` validation inside the same transaction before inserting a render.
- Require warning acknowledgement if the validation contract marks warnings as acknowledgement-required.
- Insert immutable render metadata and structured inputs.
- Update `public_program_share.active_render_id` and `expires_at` atomically.
- Preserve the stable share token.
- Record `PROGRAM_PUBLISHED` or `PROGRAM_REPUBLISHED`.
- Never return SQL/provider/exception details.

### New history route

Create:

- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/publication-history/route.ts`
  - `GET`: authenticated program-view permission; returns version, published timestamp, publisher display label where permitted, template/version IDs, active flag, expiration state, and safe metadata only.
  - Must scope both `meeting_id` and `ward_id` and use `setDbContext` inside a transaction.

### New rollback route

Create:

- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/publication-history/rollback/route.ts`
  - `POST { "version": number }`.
  - Requires `canRollbackProgram()` and ward profile permission.
  - Locks the meeting/share row and target render.
  - Verifies target belongs to the route meeting and ward and has complete immutable inputs.
  - Updates only the active pointer and expiration metadata.
  - Does not edit or delete any render row.
  - Records `PROGRAM_ROLLBACK`.
  - Returns `{ activeVersion, previousActiveVersion }`.

### Existing validation routes

Modify:

- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-design/validate/route.ts`
- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-design/print-validate/route.ts`

Use shared validation contracts. Ensure malformed JSON, non-object JSON, invalid `source`, invalid versions, cross-ward meeting IDs, and unavailable media return stable `BAD_REQUEST`, `FORBIDDEN`, `NOT_FOUND`, or `VALIDATION_FAILED` responses.

### Public routes

Modify:

- `apps/web/app/p/[meetingToken]/route.ts`
- `apps/web/app/p/ward/[portalToken]/route.ts`

Use the active pointer, not `ORDER BY version DESC`. Enforce expiration. Return public not-found behavior for expired shares without disclosing whether the cause was expiration or missing data. Add:

- `X-Robots-Tag: noindex, nofollow`
- matching HTML `<meta name="robots" content="noindex,nofollow">` through the snapshot/public HTML path where applicable.

Do not accept ward IDs. Do not expose render IDs, ward IDs, private metadata, or draft content.

### Program settings route

Modify:

- `apps/web/app/api/w/[wardId]/program-settings/route.ts`
- `apps/web/src/document-designer/persistence.ts`

Validate expiration settings server-side, audit changes, and ensure only ward administrators can modify them.

## M8.4 UI

Modify:

- `apps/web/app/programs/[meetingId]/program-designer-client.tsx`
  - pre-publish validation panel;
  - error/warning/info grouping;
  - warning acknowledgement;
  - publish/republish state;
  - publication history dialog/panel;
  - active-version indicator;
  - rollback confirmation showing target timestamp/version and consequence;
  - expiration status.
- `apps/web/app/programs/[meetingId]/page.tsx` or the current owning page entrypoint if history belongs outside the client shell.
- `apps/web/app/settings/programs/page.tsx` or the actual settings page discovered during implementation for expiration policy controls.

UI must remain informational. Every publish/rollback decision is rechecked server-side.

## M8.5 M8 tests

Create/modify:

- `apps/web/src/document-designer/publication-validation.vitest.ts`
  - unsafe block rejection;
  - internal-only data rejection;
  - invalid link rejection;
  - missing alt text rejection;
  - image/media scope rejection;
  - overflow error/warning classification;
  - warning acknowledgement behavior.
- `apps/web/src/document-designer/publication-history.vitest.ts`
  - ordered history;
  - exact meeting/ward scoping;
  - valid rollback target;
  - cross-ward/cross-meeting rejection;
  - immutable-row preservation.
- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/publish/route.vitest.ts`
  - first publish and republish;
  - validation failure causes no render/share mutation;
  - stable token preserved;
  - active pointer updated atomically;
  - Program Editor permission profile respected;
  - rollback permission not implied by publish permission.
- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/publication-history/route.vitest.ts`
- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/publication-history/rollback/route.vitest.ts`
  - auth, wrong ward, missing meeting, invalid JSON/version, forbidden role, stale target, successful rollback, audit event, stable error contracts.
- `apps/web/app/p/[meetingToken]/route.vitest.ts`
- `apps/web/app/p/ward/[portalToken]/route.vitest.ts`
  - active pointer selection;
  - expiration;
  - noindex headers;
  - stable 404 behavior;
  - no draft fallback.
- `apps/web/src/db/program-publication-rls.vitest.ts`
  - immutable render update/delete rejection;
  - active pointer same-meeting/same-ward constraints;
  - cross-ward history and rollback denial;
  - expiration policy isolation.
- `apps/web/e2e/program-designer-publishing.spec.ts`
  - publish, republish, history, rollback, stable public URL, later draft edit isolation, expired public page.

## M8 acceptance criteria

- Publish validation blocks unsafe output server-side.
- Republish creates a new immutable version.
- Rollback changes the active pointer only.
- Historical versions remain readable internally and unchanged.
- Stable QR/public URLs resolve to the selected active version.
- Later draft edits do not change active or historical public output.
- Expired public programs are not served and are not indexed.
- Wrong-ward users cannot inspect, publish, or roll back another ward's versions.
- Draft and published PDFs continue to use the correct source.

---

# Milestone 9 — Stake/System Templates and Locking

## M9 outcome

Authorized stake administrators can create and publish stake templates visible to wards in that stake. Authorized system administrators can manage system templates. Ward users can read only templates available to their ward and can copy them into ward-controlled templates without gaining write access to the source. Template lock policies are enforced server-side across structure, style, content, visibility, and distribution mode.

## M9.1 Permission and tenancy model

### Add explicit stake assignment support

The current repository has `ward_user_role` and global roles but no stake-scoped assignment. Recommended model:

- Add `STAKE_ADMIN` to the role seed/type definitions with `scope = 'STAKE'`.
- Create `stake_user_role` with:
  - `id UUID PRIMARY KEY`;
  - `stake_id UUID NOT NULL REFERENCES stake(id) ON DELETE CASCADE`;
  - `user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE`;
  - `role_id UUID NOT NULL REFERENCES role(id)`;
  - grant/revoke/audit timestamps and actor IDs matching existing role-assignment conventions;
  - unique `(stake_id, user_id, role_id)`.
- Enable and force RLS. Stake admins can administer only their assigned stake. Ward users never receive write access through stake template visibility.

If repository policy rejects a new stake role, stop before implementation and explicitly choose an alternative. Do not silently reuse `STAND_ADMIN` for stake-wide administration.

Modify:

- `apps/web/src/auth/roles.ts`
  - `STAKE_ADMIN` type/role;
  - `canViewStakeTemplates()`;
  - `canManageStakeTemplates()`;
  - `canPublishStakeTemplates()`;
  - `canArchiveStakeTemplates()`;
  - `canManageSystemTemplates()` for `SUPPORT_ADMIN`/`SYSTEM_ADMIN` only;
  - `canCopyAvailableTemplate()`;
  - all helpers require active ward/stake context where relevant.
- Role/session loading files discovered by the existing auth implementation so stake assignments are included without broadening ward privileges.
- `apps/web/src/auth/roles.vitest.ts`
- role seed/migration files matching the existing repository convention.

## M9.2 Database and migration work

### Migration `apps/web/drizzle/0079_stake_template_administration.sql`

Create `stake_user_role`, role seed data, RLS, indexes, and audit-compatible assignment fields.

### Migration `apps/web/drizzle/0080_template_distribution_and_lock_policy.sql`

Extend `document_template` with explicit policy fields instead of overloading arbitrary JSON:

- `distribution_policy TEXT NOT NULL DEFAULT 'DUPLICATE_AND_CUSTOMIZE'` with values `USE_AS_IS`, `DUPLICATE_AND_CUSTOMIZE`, `REQUIRED`.
- `source_template_id UUID NULL REFERENCES document_template(id) ON DELETE SET NULL` for copy lineage.
- `source_template_version INTEGER NULL`.
- `published_by_user_id UUID NULL REFERENCES user_account(id) ON DELETE SET NULL`.
- `published_at TIMESTAMPTZ NULL`.

Keep `lock_json` for detailed property locks, but validate its shape. It must support:

- template-level lock mode: `UNLOCKED`, `STYLE_LOCKED`, `STRUCTURE_LOCKED`, `CONTENT_ONLY`;
- locked page/region/block IDs;
- locked property names;
- protected theme values;
- protected visibility/ordering rules.

Add checks:

- `SYSTEM` templates have no ward/stake write owner.
- `STAKE` templates reference a stake.
- `WARD`/`PERSONAL_DRAFT` templates reference a ward.
- published templates have a current published version and publication metadata.
- source lineage cannot point to itself or cross an unauthorized source scope.

Add indexes:

- `(scope_type, scope_id, document_type, status)`;
- `(source_template_id, source_template_version)`;
- published template lookup by stake and document type.

### RLS

Modify the template policies from `0064` in the forward migration:

- readable:
  - system published templates;
  - stake published templates where the current ward belongs to the template stake;
  - ward templates for current ward;
  - personal drafts owned by current user.
- writable:
  - stake templates only for authorized `STAKE_ADMIN`/system administrators in the matching stake;
  - system templates only for support/system administrators through explicit controlled paths;
  - ward/personal templates only through existing narrow program permissions.
- version rows inherit the template scope and write rules.
- FORCE RLS remains enabled.

Do not grant source-template write access to ward users merely because they can duplicate it.

## M9.3 Template domain and lock enforcement

Create:

- `apps/web/src/document-designer/template-scope.ts`
  - scope parsing;
  - matching stake/ward resolution;
  - source visibility and copy rules;
  - no broad OR predicates.
- `apps/web/src/document-designer/template-locks.ts`
  - parse/validate lock policy;
  - compare proposed layout against published/base layout;
  - enforce template-level and page/region/block/property locks;
  - reject forged client payloads;
  - preserve stable IDs;
  - return stable lock violation codes.
- `apps/web/src/document-designer/template-administration-service.ts`
  - create draft;
  - create immutable version;
  - publish/archive;
  - duplicate/copy with lineage;
  - list history;
  - validate scope and actor permission.
- `apps/web/src/document-designer/template-locks.vitest.ts`
- `apps/web/src/document-designer/template-scope.vitest.ts`
- `apps/web/src/document-designer/template-administration-service.vitest.ts`

Modify:

- `apps/web/src/document-designer/template-service.ts`
  - use shared scope and lock helpers;
  - stop treating all non-system templates as ward-editable;
  - expose distribution/lock metadata safely.
- `apps/web/src/document-designer/schema.ts` / `advanced-schema.ts`
  - strict lock/distribution schema validation;
  - no arbitrary executable conditions or HTML/CSS.
- `apps/web/src/document-designer/lock-enforcement.ts`
  - either delegate to or be consolidated with `template-locks.ts`; avoid two conflicting lock implementations.
- `apps/web/src/document-designer/built-in-templates.ts`
  - declare system scope, policy, lock defaults, and thumbnails explicitly.

## M9.4 Routes

### Ward-facing routes

Modify existing routes:

- `apps/web/app/api/w/[wardId]/document-templates/route.ts`
  - list built-in/system, published stake, published ward, and caller-owned personal drafts;
  - create only permitted ward/personal drafts;
  - return distribution and lock metadata.
- `apps/web/app/api/w/[wardId]/document-templates/[templateId]/route.ts`
  - enforce read scope and redact inaccessible versions.
- `apps/web/app/api/w/[wardId]/document-templates/[templateId]/versions/route.ts`
  - allow new versions only for editable scope and permitted actor;
  - enforce locks against the published/base version.
- `apps/web/app/api/w/[wardId]/document-templates/[templateId]/publish/route.ts`
  - support only the correct scope owner/admin;
  - set publication metadata atomically;
  - require valid lock policy and version.
- `apps/web/app/api/w/[wardId]/document-templates/[templateId]/duplicate/route.ts`
  - permit copying system/stake/ward sources into a new ward template only when configured;
  - preserve source lineage without granting source mutation.

Create:

- `apps/web/app/api/w/[wardId]/document-templates/[templateId]/archive/route.ts`
  - ward archive only for authorized ward template managers;
  - never archive a source template through a ward copy action.
- `apps/web/api/w/[wardId]/document-templates/[templateId]/history/route.ts` if history is not cleanly represented by the existing `versions` route. Prefer extending the existing versions route if possible.

### Stake routes

Create:

- `apps/web/app/api/stakes/[stakeId]/document-templates/route.ts`
  - `GET` list stake-owned templates and readable system templates relevant to the stake admin;
  - `POST` create a stake draft.
- `apps/web/app/api/stakes/[stakeId]/document-templates/[templateId]/route.ts`
  - `GET` detail;
  - `PATCH` metadata/policy changes in draft state only.
- `apps/web/app/api/stakes/[stakeId]/document-templates/[templateId]/versions/route.ts`
  - `GET` history;
  - `POST` new draft version with lock enforcement.
- `apps/web/app/api/stakes/[stakeId]/document-templates/[templateId]/publish/route.ts`
  - publish immutable stake version;
  - audit action.
- `apps/web/app/api/stakes/[stakeId]/document-templates/[templateId]/archive/route.ts`
  - archive stake template without invalidating existing ward meeting snapshots.

Every stake route must verify that the route stake matches the active ward's stake or the user's explicit stake context and that the actor has stake administration permission.

### System routes

Create:

- `apps/web/app/api/support/document-templates/route.ts`
- `apps/web/app/api/support/document-templates/[templateId]/route.ts`
- `apps/web/app/api/support/document-templates/[templateId]/versions/route.ts`
- `apps/web/app/api/support/document-templates/[templateId]/publish/route.ts`
- `apps/web/app/api/support/document-templates/[templateId]/archive/route.ts`

These routes are restricted to `SUPPORT_ADMIN`/`SYSTEM_ADMIN` according to existing support authorization patterns. They must not accept a ward ID and must use explicit system-template scope checks.

### Audit actions

Add stable actions:

- `STAKE_TEMPLATE_CREATED`
- `STAKE_TEMPLATE_VERSION_CREATED`
- `STAKE_TEMPLATE_PUBLISHED`
- `STAKE_TEMPLATE_ARCHIVED`
- `SYSTEM_TEMPLATE_CREATED`
- `SYSTEM_TEMPLATE_VERSION_CREATED`
- `SYSTEM_TEMPLATE_PUBLISHED`
- `SYSTEM_TEMPLATE_ARCHIVED`
- `PROGRAM_TEMPLATE_DUPLICATED`
- `PROGRAM_TEMPLATE_LOCK_VIOLATION`

## M9.5 UI

Create or modify the existing template gallery/editor surfaces:

- `apps/web/app/programs/templates/page.tsx`
- `apps/web/app/programs/templates/template-gallery-client.tsx`
- `apps/web/app/programs/templates/[templateId]/page.tsx` if the route pattern exists or is preferable.
- `apps/web/app/programs/templates/template-admin-client.tsx` for ward/stake/system mode-specific administration.
- `apps/web/app/programs/[meetingId]/program-designer-client.tsx`
  - show source scope and publication version;
  - show lock badges and explain unavailable controls;
  - offer `Use as-is` vs `Duplicate and customize` according to policy;
  - never imply that a ward user can edit a stake/system source.
- `apps/web/src/auth/navigation.ts`
  - show Templates only when the caller has the relevant program/stake/system capability;
  - retain Program Editor navigation isolation.

Accessible requirements:

- keyboard-operable gallery and lock explanations;
- visible focus state;
- no drag-only template actions;
- screen-reader labels for scope, lock mode, version, and policy.

## M9.6 M9 tests

Create/modify:

- `apps/web/src/auth/roles.vitest.ts`
  - stake admin scope;
  - system admin restrictions;
  - ward Program Editor cannot administer stake/system templates;
  - copying is distinct from editing/publishing.
- `apps/web/src/db/stake-template-rls.vitest.ts`
  - same-stake read/write success;
  - cross-stake denial;
  - ward read of published stake template;
  - ward cannot update/delete stake/system source;
  - system template source isolation;
  - FORCE RLS behavior.
- `apps/web/src/document-designer/template-scope.vitest.ts`
  - explicit SYSTEM/STAKE/WARD/PERSONAL_DRAFT matching;
  - malformed scope combinations rejected;
  - no unrelated nullable owner match.
- `apps/web/src/document-designer/template-locks.vitest.ts`
  - unlocked edits;
  - style lock;
  - structure lock;
  - content-only lock;
  - locked page/region/block/property forged payloads;
  - stable IDs and ordering preserved;
  - required/use-as-is/duplicate-and-customize behavior.
- `apps/web/src/document-designer/template-administration-service.vitest.ts`
  - immutable versions;
  - publish/archive transitions;
  - source lineage;
  - audit events;
  - no mutation of source on duplicate.
- Existing route tests:
  - `apps/web/app/api/w/[wardId]/document-templates/route.vitest.ts`
  - add route coverage for all scope combinations, locks, and forbidden writes.
- Create route tests for stake and support template endpoints alongside each route.
- `apps/web/e2e/program-template-gallery.spec.ts`
  - ward sees available system/stake/ward templates;
  - ward can duplicate but cannot edit source;
  - stake admin can create/publish a stake template;
  - system admin can manage a system template;
  - lock badges/control disabling match server rejection;
  - Program Editor does not see unrelated administration.

## M9 acceptance criteria

- A ward can read published system/stake templates available to its stake.
- A ward cannot write or archive the source stake/system template.
- A permitted ward user can copy a source into a ward-owned draft.
- Stake admins can manage only their own stake templates.
- System administrators can manage only system templates through support routes.
- Published template versions are immutable.
- Template locks are enforced on the server for crafted requests.
- Existing meetings retain their stored layout/template-version snapshot after source template changes.
- Existing ward public URLs and meeting publication behavior remain unchanged.
- Every administrative mutation is audit logged.

---

# Final review and verification plan

## Required order

Do not commit or push Milestone 8 or 9 changes until all applicable gates below are complete.

1. Confirm branch, clean baseline, and migration numbering.
2. Run focused unit/domain tests for the current milestone.
3. Run route tests serially with no file parallelism where database mocks or migrations are involved.
4. Run disposable PostgreSQL migration/RLS tests.
5. Run component tests.
6. Run Playwright E2E tests with two wards, two stakes, and the required roles.
7. Run typecheck.
8. Run owning-workspace lint.
9. Run production build.
10. Regenerate and check `docs/DEPENDENCY_GRAPH.md` only after source changes are complete.
11. Run `git diff --check` and inspect the exact staged diff.
12. Obtain a fresh independent exact-tree security/logic review after the final edit and staging operation.
13. Fix findings, rerun all affected gates, and obtain another fresh review. Prior reviews become stale after every patch.
14. Verify GitHub CI/CodeQL and PR head.
15. Verify deployment/migration status separately. Do not claim live PostgreSQL/RLS success when it was not exercised.

## Exact verification commands

Run from `/root/workspaces/the-stand` unless noted:

```bash
npm test --workspace @the-stand/web -- --run --no-file-parallelism
npm run typecheck --workspace @the-stand/web
npm run lint --workspace @the-stand/web
npm run build --workspace @the-stand/web
npm run docs:dependencies
npm run docs:dependencies:check
git diff --check
git status --short --branch
git diff --cached --stat
git diff --cached --check
gh pr checks <PR_NUMBER>
```

Focused commands should target the exact M8/M9 files, for example:

```bash
npm test --workspace @the-stand/web -- --run --no-file-parallelism \
  src/document-designer/publication-validation.vitest.ts \
  src/document-designer/publication-history.vitest.ts \
  src/document-designer/template-scope.vitest.ts \
  src/document-designer/template-locks.vitest.ts
```

The implementation phase must record pre-existing typecheck/test failures separately from regressions. A green unit suite does not replace live PostgreSQL/RLS, browser, or CI evidence.

## Exact independent review checklist

The final reviewer must inspect the exact staged tree and verify:

- active public pointer cannot cross meeting or ward boundaries;
- historical renders and structured inputs are immutable;
- rollback cannot mutate/delete history;
- expiration cannot leak whether a private/public version exists;
- public routes use active snapshots only and send noindex/nofollow;
- publish validation is rerun server-side;
- warning acknowledgement cannot bypass errors;
- draft PDF and published PDF source separation remains intact;
- every template scope query explicitly matches SYSTEM/STAKE/WARD/PERSONAL_DRAFT semantics;
- stake/system write paths use correct roles and RLS;
- ward users cannot mutate source stake/system rows;
- lock enforcement compares all protected structure/style/content/visibility fields;
- route IDs, meeting IDs, template IDs, stake IDs, and ward IDs are cross-checked;
- SQL parameters use explicit casts where required, especially JSONB and UUID values;
- errors remain stable and do not serialize SQL/provider/exception details;
- audit events exist for publish, rollback, expiration changes, template administration, and lock violations;
- public output contains no private/internal block data;
- compatibility routes and stable public tokens remain intact.

## Final deliverable evidence

The completion report must list separately:

- files changed and migrations applied;
- routes added/changed;
- focused test counts;
- full test result;
- typecheck result;
- lint/build result;
- PostgreSQL/RLS result;
- Playwright/browser result;
- independent review verdict;
- GitHub CI/CodeQL result;
- deployment/migration result;
- any unverified gates.

Do not call either milestone complete while a required gate is pending or unverified.

---

# Open decisions to resolve before implementation

1. **Stake administrator identity:** approve the recommended `STAKE_ADMIN` role plus `stake_user_role`, or explicitly choose another existing assignment model. Do not infer stake administration from ward roles.
2. **Expiration semantics:** confirm whether expiration is calculated from publication time, meeting date, or public-share activation time. The plan assumes publication/activation time unless repository policy says otherwise.
3. **Rollback semantics:** confirm whether rollback immediately changes the active public program or creates a new visible publication event. The plan assumes pointer-only rollback with a new audit record and no new render row.
4. **Warning acknowledgement:** confirm which validation warnings require an explicit user acknowledgement before publish. Errors always block.
5. **System-template ownership:** confirm whether `SUPPORT_ADMIN` and `SYSTEM_ADMIN` both manage system templates or whether only one is allowed.
6. **Existing public HTML metadata:** confirm whether the renderer can safely inject the robots meta tag into stored snapshots or whether the route must add the `X-Robots-Tag` header only until snapshots are regenerated.

Plan status: complete. No application code was changed while producing this plan.
