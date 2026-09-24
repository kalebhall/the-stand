# Module Settings Enable/Disable Implementation Plan

> **Execution record.** This document records the implementation and verification of the new-install module enablement transition. Legacy fixed-column feature settings are intentionally removed; no compatibility path is retained.

**Goal:** Add a durable, ward-scoped Settings control for enabling and disabling optional The Stand modules while permanently protecting the Conducting Core.

**Architecture:** Keep the existing modular-monolith registry as the source of module metadata. Add a ward-scoped persistence layer for overrides, compose effective enablement as `persisted override ?? registry default`, and enforce that state in navigation, permissions, routes, event subscriptions, and module-owned surfaces. The Core remains enabled and must continue working when every optional module is disabled.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL/SQL migrations, existing RLS and audit services, Vitest, current module registry and permission composition.

---

## 1. Current repository facts

The repository already has the architectural seam but not durable settings:

- Module definitions live in `apps/web/src/modules/registry.ts`.
- Module contracts live in `apps/web/src/modules/types.ts`.
- In-memory/test enablement lives in `apps/web/src/modules/enablement.ts`.
- The enablement harness already supports ward-specific overrides and Core-only tests in `apps/web/src/modules/enablement.vitest.ts`.
- Module permissions are composed in `apps/web/src/platform/permissions/index.ts`.
- Existing Settings entrypoint is `apps/web/app/settings/page.tsx`.
- The legacy fixed-column `ward_feature_settings` table and `/feature-flags` API are removed by migration `0003_remove_legacy_ward_feature_settings.sql`.
- Module state is now represented only by the registry plus `ward_module_enablement` overrides.

## 1.1 Execution status

Started and verified in the current worktree:

- Durable `ward_module_enablement` table and forward migrations `0001_module_enablement.sql` / `0002_module_enablement_rls.sql`.
- Matching Drizzle schema definition in `apps/web/src/db/schema.ts`.
- Effective module policy/service in `apps/web/src/modules/service.ts`.
- `module-settings.manage` permission for `STAND_ADMIN`.
- Ward-scoped `GET`/`PATCH /api/w/[wardId]/module-settings`.
- Settings UI module toggles with Core locked on.
- Persisted module state used by navigation.
- Technology Checklist page/API now honor persisted module enablement.
- Typed module event dispatch wired after successful meeting creation/completion.
- Persisted `programs` enforcement added to `/programs`, meeting program designer, template gallery/detail pages, program design GET/PUT/POST APIs, and program-design PDF generation.
- Persisted module guards added to Members, Callings, Membership & Ordinances, Notifications, Announcements, Reports, Imports, and Programs template administration pages.
- Persisted module guards added to Members, Callings, Notifications, Announcements, Membership Ordinances, and Membership Imports primary and child APIs, including direct-entrypoint denial for Callings mutations.
- Route tests updated for the new persisted-enablement lookup boundary, including disabled direct-entrypoint coverage.
- Full unit suite, web checks/build, root build, serialized PostgreSQL/RLS suites, and dependency graph checks pass.

Still outstanding:

- Migrate every remaining module-owned page/API route to the persisted module guard.
- Add route/UI tests for the Settings API and module toggle component.
- Add production integration tests proving disabled event handlers are skipped after persisted settings are loaded.
- Complete browser verification of the Settings flow and direct-route denial.
- Extract the next optional module and later extract the advanced designer.
## 2. Scope

### Included

- Durable per-ward enable/disable state for registered optional modules.
- Settings UI for authorized ward administrators.
- Server-side read/write route with ward isolation and authorization.
- Audit records for enable/disable changes.
- Registry-aware effective enablement used by navigation, permissions, route guards, and event dispatch.
- Core-only fallback verification.
- Explicit disabled behavior documented per module.

### Not included

- Runtime plugin loading or third-party extensions.
- Module dependency graphs or arbitrary configuration blobs.
- Turning off the Conducting Core.
- Replacing the existing advanced-designer environment flag in this phase.
- Deleting module data when a module is disabled.
- Automatic data migration or archival when a module is disabled.
- Stake-wide enablement unless a separate stake administration requirement is approved.

## 3. Effective enablement model

For a ward and module:

```text
effectiveEnabled = persisted ward override if present
                   otherwise module.defaultEnabled
```

Rules:

- `conducting-core` is always enabled; attempts to disable it return a validation error.
- Unknown module IDs are rejected by the registry, never inserted.
- A disabled module’s existing data remains preserved and inaccessible through normal module UI/routes.
- Re-enabling restores access to the preserved data.
- Enablement is not authorization. Every operation still requires active-ward access and role/capability authorization.
- Support/admin access must not bypass ward isolation or create cross-ward settings writes.
- If a module is disabled, its event handlers must not run for that ward.

## 4. Proposed persistence

Create a forward migration after the current latest migration in `apps/web/drizzle/`.

### Table: `ward_module_enablement`

- `ward_id uuid NOT NULL`
- `module_id text NOT NULL`
- `enabled boolean NOT NULL`
- `updated_by_user_id uuid NOT NULL`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- Primary key: `(ward_id, module_id)`
- Foreign key to the ward table used by the current schema.
- Foreign key to the user table used by the current schema.
- Check constraint preventing `module_id = 'conducting-core'` from being stored as disabled, or enforce this in the service and migration seed path.
- Index `(ward_id, enabled)` for effective-module reads.

Use explicit forward-only migration semantics. Do not modify `0000_v2_baseline.sql` or archived migrations.

### RLS

- Enable and force RLS.
- Reuse the repository’s current active-ward/session policy functions.
- A ward-scoped session may read and update only rows for its active ward.
- A user with support access must still use the existing explicit support assignment boundary; do not create a broad cross-ward bypass.
- Add negative cross-ward read/write tests.

## 5. Application contracts

### Registry contract

Keep `ModuleDefinition` in `apps/web/src/modules/types.ts` minimal. Add only the persistence-facing helper contracts needed by this feature, for example:

- `listModuleSettings(wardId, actor)`
- `getEffectiveModuleEnablement(wardId)`
- `setModuleEnabled(wardId, moduleId, enabled, actor)`

Do not add lifecycle hooks or dependency graphs.

### Effective enablement service

Extend or add a service near `apps/web/src/modules/enablement.ts` that:

- loads persisted overrides;
- applies registry defaults;
- hard-protects Core;
- returns stable module IDs and metadata;
- supports an injected enablement implementation for unit tests;
- avoids importing optional module implementation code into Core.

The service must be the authoritative source consumed by production route guards and server navigation composition. The existing in-memory harness remains useful for isolated tests but must not be described as durable configuration.

### Permission

Add a purpose-specific permission such as `modules.manage` or `module-settings.manage`.

Recommended authorization:

- `STAND_ADMIN`: allowed.
- Other ward roles: denied unless an explicit product decision grants them access.
- Stake/support roles: no automatic cross-ward access; use existing ward assignment and support boundaries.

Do not broaden generic meeting-management permissions merely because the Settings page already uses them.

## 6. Routes and UI

### API route

Create:

- `apps/web/app/api/w/[wardId]/module-settings/route.ts`

Methods:

- `GET`: return all registry modules with effective state, metadata, and whether the row is an override or default.
- `PUT` or `PATCH`: update one module’s enabled state.

Response shape should include:

```ts
{
  modules: Array<{
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    defaultEnabled: boolean;
    overridden: boolean;
    canDisable: boolean;
  }>
}
```

Write behavior:

- Authenticate.
- Validate active ward and target ward.
- Check `module-settings.manage`.
- Validate module ID against registry.
- Reject disabling Core.
- Persist using an idempotent upsert.
- Record an audit event containing ward, module ID, previous state, new state, actor, and reason if the audit contract supports a reason field.
- Read back the exact persisted/effective state before returning success.

Error behavior:

- `401` unauthenticated.
- `403` unauthorized or wrong ward.
- `404` unknown module/ward where consistent with existing route conventions.
- `409` attempt to disable Core or conflicting update.
- Stable validation error for malformed state.

### Settings UI

Add:

- `apps/web/app/settings/modules/page.tsx` or integrate a dedicated module section into `apps/web/app/settings/page.tsx`.
- `apps/web/app/settings/modules/module-settings-client.tsx` for interactive toggles.

UI requirements:

- Show module name, purpose, enabled state, and disabled behavior.
- Mark Conducting Core as required and non-toggleable.
- Explain that disabling preserves existing data.
- Require confirmation before disabling a module.
- Show pending, success, and error states.
- Refresh from the server after writes.
- Do not rely on hiding navigation as security.
- Do not show controls to unauthorized users.

Add a Settings link only for users who can manage module settings.

## 7. Enforcement fan-out

Trace every registered module through these surfaces:

1. **Navigation**
   - Use authoritative ward-scoped effective enablement.
   - Remove disabled-module navigation items.

2. **Permissions**
   - `hasModulePermission` must combine active-ward access, effective module state, and role/capability.

3. **Routes/API**
   - Add a reusable `assertModuleEnabled(wardId, moduleId, context)` guard.
   - Apply it to module-owned route families, not just pages.
   - Direct URL access must fail when disabled.

4. **Events**
   - `apps/web/src/platform/events/dispatch.ts` must load/receive ward enablement and skip disabled module handlers.
   - Core event contracts remain typed and module-independent.

5. **Public/print/offline behavior**
   - Document each module’s behavior when disabled.
   - A disabled optional module must not break Core meeting preparation, conducting, publication, print, PDF, or offline conducting paths.
   - Preserve immutable published snapshots where required; do not silently rewrite historical output merely because a module is later disabled.

6. **Data ownership**
   - Module tables remain preserved.
   - Core must not import module-owned tables or routes.

## 8. Implementation sequence

### Task 1: Define persistence and effective-state contract

Files:

- Create forward migration under `apps/web/drizzle/`.
- Modify `apps/web/src/modules/types.ts`.
- Modify `apps/web/src/modules/enablement.ts`.
- Add service tests near `apps/web/src/modules/enablement.vitest.ts`.

Tests first:

- Default state follows registry defaults.
- Ward A override does not affect Ward B.
- Unknown modules are rejected.
- Core cannot be disabled.

### Task 2: Add repository service and RLS

Files:

- Add module-settings repository/service under `apps/web/src/modules/` or the repository’s established database service location.
- Add migration RLS policies.
- Add database/RLS tests under `apps/web/src/db/`.

Tests:

- Ward-scoped read/write success.
- Cross-ward reads return no rows.
- Cross-ward writes fail.
- Unauthorized actor cannot update settings.
- Idempotent repeated writes.

### Task 3: Add permission and API route

Files:

- Modify `apps/web/src/platform/permissions/index.ts`.
- Add `apps/web/app/api/w/[wardId]/module-settings/route.ts`.
- Add route tests beside the route.

Tests:

- GET returns registry modules and effective states.
- PUT enables/disables an optional module.
- Core disable is rejected.
- Wrong ward is rejected.
- Unauthorized roles are rejected.
- Audit failure does not falsely report a successful state change if the existing audit policy requires failure handling.
- Response is verified by a read-back query.

### Task 4: Add Settings UI

Files:

- Add module Settings page/client or extend `apps/web/app/settings/page.tsx`.
- Add component tests.
- Update navigation/settings links if needed.

Tests:

- Authorized administrator sees toggles.
- Unauthorized user does not see controls.
- Core is visibly locked on.
- Confirmation is required for disable.
- Error and reload states are handled.

### Task 5: Wire authoritative enablement into runtime surfaces

Files:

- Modify `apps/web/src/auth/navigation.ts`.
- Modify `apps/web/src/platform/permissions/index.ts`.
- Modify `apps/web/src/platform/events/dispatch.ts`.
- Add reusable route guard.
- Update each module-owned route/page incrementally.

Tests:

- Disabled module navigation disappears.
- Direct route/API access is denied.
- Module permission is denied even for an otherwise authorized role.
- Disabled module event handler does not run.
- Re-enabled module resumes normal behavior.

### Task 6: Core-only regression harness

Files:

- Extend `apps/web/src/modules/enablement.vitest.ts`.
- Add or extend Core integration tests under `apps/web/src/conducting/` and relevant meeting routes.

Verify with all optional modules disabled:

- meeting preparation;
- at-the-Stand conducting;
- publish;
- print;
- PDF;
- offline conducting where applicable.

### Task 7: Documentation and operational notes

Files:

- Update module documentation/AGENTS guidance if needed.
- Document module IDs, defaults, ownership, disabled behavior, and data retention.
- Document that the advanced-designer environment flag remains separate until intentionally unified.

## 9. Verification gates

Run in this order after implementation:

1. Focused module enablement, permission, route, UI, and Core-only tests.
2. Database migration check against disposable test database.
3. RLS tests run sequentially when they share disposable schema objects:

```bash
set -a; . ./.env.test; set +a
export DATABASE_URL="${TEST_DATABASE_URL:-$DATABASE_URL}"
for suite in src/db/module-settings-rls.vitest.ts src/db/p0-rls-isolation.vitest.ts; do
  npx vitest run "$suite" --pool=forks --poolOptions.forks.singleFork --testTimeout=30000
 done
```

4. Full test suite.
5. Root typecheck.
6. Web typecheck.
7. Web lint.
8. Root and web production builds.
9. Dependency graph generation and check.
10. `git diff --check`.
11. Exact-tree review after corrections.
12. Browser verification of Settings toggles and direct-route denial.

Do not call the feature complete if the canonical parallel RLS runner deadlocks; report it separately and provide sequential database evidence.

## 10. Acceptance criteria

- A ward administrator can enable or disable each optional registered module from Settings.
- Conducting Core cannot be disabled.
- State is durable and isolated per ward.
- Navigation, permissions, routes, APIs, events, and module-owned surfaces honor the same effective state.
- Hidden navigation is not the only enforcement layer.
- Existing module data is preserved while disabled.
- Core prep → conduct → publish → print/PDF remains usable with all optional modules disabled.
- All changes are auditable.
- No Core code imports optional module implementation details.
- Tests prove success, denial, ward isolation, idempotency, Core protection, disabled event behavior, and re-enable behavior.

## 11. Open decisions before implementation

1. Should `BISHOPRIC_EDITOR` also manage module settings, or only `STAND_ADMIN`?
2. Should disabling a module immediately invalidate open client pages, or only block the next server request?
3. Should module settings be included in offline snapshots, and if so, should offline clients be allowed to change them? Recommendation: no; module settings require an online authorized write.
4. Should existing published outputs remain viewable after a module is disabled? Recommendation: yes, immutable published snapshots remain available; only new module-owned editing/rendering paths are blocked.
5. Should `advanced-designer` eventually become the `programs` module’s persisted ward enablement, or remain a separate environment kill switch? Recommendation: keep both until the advanced designer extraction is complete and its compatibility behavior is explicitly reviewed.
