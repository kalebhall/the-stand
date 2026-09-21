# Program Designer Gap Remediation Plan

**Source:** uploaded Program Designer specification and repository review
**Repository:** `/root/workspaces/the-stand`
**Branch:** `feat/program-designer-milestone-5`
**Date:** 2026-09-21

## Goal

Close the verified gaps preventing the Program Designer/Milestones 8–9 work from being acceptance-ready. Preserve existing public-program behavior, stable tokens, immutable snapshots, ward isolation, and the current dirty Milestone 5–9 work. Do not commit, push, deploy, or claim completion until every gate is separately verified.

## Current verified baseline

Implemented and passing:

- Generic document/page/region/block model and typed registry.
- Simple/Advanced designer foundation, autosave/revision handling, history, media, PDF, overflow validation.
- Immutable publication history, active pointer, rollback, expiration, noindex/nofollow.
- Program Editor role and program-specific helpers.
- Ward/stake/system template routes, lineage, locks, administration UI, and audit actions.
- Full web tests: 570 passed, 3 skipped.
- Lint/build/dependency graph/diff check passed.

Known failures/gaps:

- Web typecheck fails in pre-existing Advanced Designer and JS contract declaration areas.
- Support Admin route authorization conflicts with database RLS, which currently recognizes only `SYSTEM_ADMIN` for system-template writes.
- Stake/system/support navigation and page access are incomplete or inconsistent.
- Admin UI displays a generic “Source locked” state instead of actual lock policy/mode.
- Program Editor media upload/delete policy flags are not enforced by the API.
- Stake/support route tests, dedicated stake RLS tests, and M9 Playwright coverage are missing.
- Live PostgreSQL/RLS migration execution has not been performed.
- Built-in gallery thumbnail paths point to missing SVG assets.

## Execution rules

1. Use test-first changes for behavioral fixes: add a focused failing test, run it, implement the smallest fix, rerun focused tests, then run affected regression tests.
2. Do not broaden `canManageMeetings()`.
3. Keep system/stake/ward/personal template scope explicit in every route and service query.
4. Keep source templates immutable to ward users; copying creates a ward-owned resource.
5. Keep `SUPPORT_ADMIN` and `SYSTEM_ADMIN` behavior consistent across route helpers, service authorization, RLS, and UI. The selected contract is: both may use support system-template routes, while only authorized support/system actors may mutate system templates in SQL; implement one explicit database helper/policy rather than relying on route checks alone.
6. Never claim live RLS success based on static assertions or mocked Vitest tests.
7. Keep unrelated existing dirty work intact.

## Work phases

### Phase 1 — Authorization and navigation boundary

**Goal:** Make the role contract coherent before UI/API testing.

Files to modify:

- `apps/web/src/auth/roles.ts`
- `apps/web/src/auth/navigation.ts`
- `apps/web/app/programs/templates/page.tsx`
- `apps/web/app/programs/templates/admin/page.tsx`
- `apps/web/src/auth/roles.vitest.ts`
- `apps/web/src/auth/navigation.vitest.ts`

Tasks:

- Add explicit capability helpers for system/stake template administration navigation and page access.
- Allow support/system admins to reach system administration without requiring an active ward.
- Allow stake admins to reach stake administration using explicit `activeStakeId`/assignment context.
- Keep ward gallery access limited to Program Designer capability.
- Ensure Program Editor navigation does not expose unrelated administration.
- Add tests for Program Editor, stake admin, system admin, support admin, no-ward system admin, and cross-stake denial.

### Phase 2 — Media permission enforcement

**Goal:** Enforce the documented Program Editor permission profile server-side.

Files to modify:

- `apps/web/src/auth/roles.ts`
- `apps/web/app/api/w/[wardId]/media/route.ts`
- `apps/web/app/api/w/[wardId]/media/[assetId]/route.ts`
- `apps/web/app/api/w/[wardId]/program-settings/route.ts` only if response/profile wiring is required
- media route tests and role tests

Tasks:

- Add profile-aware `canManageProgramMedia`/`canDeleteProgramMedia` decisions.
- Preserve ward/stake/system read behavior.
- Require the configured upload capability for Program Editor uploads.
- Require `allowProgramEditorDeleteMedia` for Program Editor deletion; retain admin override.
- Test forbidden upload/delete and permitted configured paths.

### Phase 3 — Actual lock metadata in administration UI

**Goal:** Make UI state reflect server lock policy without weakening server enforcement.

Files to modify:

- `apps/web/app/programs/templates/admin/template-admin-client.tsx`
- `apps/web/app/programs/templates/admin/template-admin-client.vitest.tsx`
- shared lock display helper if needed

Tasks:

- Normalize and display actual lock mode and locked IDs/properties.
- Show policy (`REQUIRED`, `USE_AS_IS`, `DUPLICATE_AND_CUSTOMIZE`) separately from lock mode.
- Disable only controls protected by the actual policy.
- Add tests for each lock mode and policy.

### Phase 4 — Support/system RLS consistency

**Goal:** Remove route-vs-database authorization mismatch.

Files to modify:

- `apps/web/drizzle/0079_stake_template_administration.sql`
- `apps/web/drizzle/0080_template_distribution_and_lock_policy.sql`
- `apps/web/src/db/schema.ts` if declarations need parity
- `apps/web/src/db/template-administration-schema.vitest.ts`
- new `apps/web/src/db/stake-template-rls.vitest.ts`

Tasks:

- Define one explicit, SECURITY DEFINER, fixed-search-path system-template administration helper for the selected support/system role contract.
- Use it consistently in template and version RLS policies.
- Keep published system-template read access separate from write access.
- Preserve FORCE RLS and prevent self-escalation.
- Add static assertions for every policy and a disposable PostgreSQL integration test for same-stake, cross-stake, ward-source, and system-source behavior.

### Phase 5 — Route and audit coverage

**Goal:** Prove all M9 API surfaces.

Files to add/modify:

- `apps/web/app/api/stakes/[stakeId]/document-templates/**/route.vitest.ts`
- `apps/web/app/api/support/document-templates/**/route.vitest.ts`
- existing ward route tests
- `apps/web/src/document-designer/template-administration-service.vitest.ts`

Tasks:

- Test list/create/detail/PATCH/versions/publish/archive for stake routes.
- Test list/create/detail/PATCH/versions/publish/archive for support routes.
- Test unauthorized, cross-stake, wrong-scope, archived, immutable, lock, lineage, and audit behavior.
- Verify every administrative mutation writes the specified stable audit action.

### Phase 6 — Thumbnail assets and gallery proof

**Goal:** Make the gallery visually complete.

Files to add/modify:

- `apps/web/public/program-templates/*.svg`
- built-in template metadata/tests
- gallery component tests

Tasks:

- Add one accessible, lightweight SVG thumbnail per built-in template.
- Verify every referenced asset exists and loads.
- Test gallery grouping, scope, policy, lock/version metadata, copy behavior, and keyboard labels.

### Phase 7 — Browser E2E

**Goal:** Exercise actual two-ward/two-stake behavior.

Files to add:

- `apps/web/e2e/program-template-gallery.spec.ts`
- supporting fixtures/helpers under the existing E2E convention

Scenarios:

- Ward user reads published system/stake templates available to their stake.
- Ward user cannot mutate or archive source templates.
- Ward user duplicates a source into a ward draft.
- Stake Admin manages only their own stake.
- System/Support Admin manages system templates.
- Program Editor sees only program surfaces.
- Lock UI matches server rejection.

### Phase 8 — Typecheck and final gates

Tasks:

- Fix the Advanced Designer type mismatch without weakening the typed block model.
- Add declarations or convert the purge/retention contracts to typed modules.
- Run focused tests, full tests, live PostgreSQL/RLS tests, Playwright, typecheck, lint, build, dependency graph, and diff checks.
- Run a fresh exact-tree security review after all edits.
- Verify CI/CodeQL and deployment/migration status separately.

## Verification commands

```bash
npm test --workspace @the-stand/web -- --run --no-file-parallelism
npm run typecheck --workspace @the-stand/web
npm --workspace @the-stand/web run lint
npm run build --workspace @the-stand/web
npm run docs:dependencies
npm run docs:dependencies:check
git diff --check
```

Additional required evidence:

- Disposable PostgreSQL migration/RLS test output.
- `npx playwright test apps/web/e2e/program-template-gallery.spec.ts` output.
- `gh pr checks <PR>` output when a PR exists.
- Deployment/migration readback when deployment is authorized.

## Non-goals

- No baptism/funeral document type.
- No arbitrary HTML/CSS/JS/fonts/SVG uploads.
- No real-time collaboration.
- No destructive migration or production data reset.
- No commit, push, deployment, or live migration application without a separate explicit request.
