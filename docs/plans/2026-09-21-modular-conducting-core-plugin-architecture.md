# Modular Conducting Core and Optional Modules Plan

> **For Hermes:** This is a planning document only. Do not implement until Kaleb explicitly authorizes execution. When execution is authorized, use the repository's feature-delivery and subagent-driven-development workflows.

**Goal:** Restructure The Stand as a modular monolith whose protected foundation is sacrament-meeting conducting, while optional capabilities can expand the product without destabilizing the core workflow.

**Architecture:** Keep one deployable Next.js application and one PostgreSQL database initially. Establish explicit platform, conducting-core, and optional-module boundaries in code and documentation before considering independently deployed plugins. Convert legacy representations at boundaries and keep domain modules behind typed contracts.

**Tech Stack:** Next.js App Router, React, TypeScript strict mode, PostgreSQL/Drizzle, Zod, NextAuth, BullMQ/Redis, Vitest, Playwright, GitHub Actions, npm workspaces.

---

## 1. Decision summary

### Recommended direction

Adopt a **modular monolith**, not a runtime plugin marketplace:

```text
Platform services
  ↓
Sacrament Conducting Core
  ↓
Optional capability modules
  ↓
Web/API/database adapters
```

Modules are statically registered in the application first. Feature flags control availability. External plugin installation, arbitrary third-party code, and separate deployments are explicitly deferred.

### Why this fits The Stand

The product's stable center is preparing and conducting a sacrament meeting. The current repository already contains separate business areas, but route handlers, domain services, rendering, persistence, publication, permissions, and offline behavior can still be coupled through direct imports and shared representations.

A conducting core gives future work a protected contract:

- A meeting can be created and conducted without optional modules.
- Optional modules can add capabilities without becoming prerequisites for conducting.
- The agent can inspect one module plus its contracts instead of the whole application.
- Tests can prove that the core still works with modules disabled.

### Strong boundary

The core must not import optional modules. Optional modules may consume core contracts and platform services.

```text
Allowed:
optional module → core contract
optional module → platform service
web adapter → module

Forbidden:
core → optional module
platform → business module
module → another module's database tables
route → another domain's repository internals
```

---

## 2. Current repository facts

Verified from the current repository:

- The repository is an npm workspaces monorepo.
- `apps/web` is the Next.js application.
- `packages/shared` contains shared TypeScript types and Zod validators.
- Business logic is currently organized under `apps/web/src/` by areas including `auth`, `db`, `meetings`, `callings`, `announcements`, `calendar`, `notifications`, `stand`, `imports`, and `document-designer`.
- App Router pages and API routes live under `apps/web/app/`.
- Database access is Drizzle/PostgreSQL with ward isolation and RLS.
- Background work uses an outbox and BullMQ/Redis.
- Public programs use immutable render snapshots.
- The recent spatial program designer crossed UI, API, persistence, projection, HTML, print, PDF, publication, lock, and compatibility boundaries. This is evidence that those boundaries need explicit contracts; it is not evidence that the feature should be discarded.
- The repository currently has one web application and one shared package. There is not yet a module registry or a separate domain package structure.

Existing guidance is in `CLAUDE.md`; future work must preserve its server-first, ward-isolated, RLS, audit, outbox, and testing conventions.

### 2.1 Prerequisites before Phase 1

Two P0 issues from `docs/GAP_ANALYSIS.md` must be resolved before any Phase 1 platform work begins. Codifying platform facades on top of a broken security foundation would freeze the gap into the module contracts.

- **RLS on 17 ward-scoped tables.** A new Drizzle migration must enable RLS and add explicit `app.ward_id` / `app.user_id` policies for: `meeting`, `meeting_program_item`, `meeting_program_render`, `meeting_business_line`, `calling_assignment`, `calling_action`, `event_outbox`, `notification_delivery`, `public_program_share`, `public_program_portal`, `announcement`, `calendar_feed`, `calendar_event_cache`, `member`, `member_note`, `import_run`, `ward_stand_template`. Cross-ward rejection tests must cover a representative subset.
- **Rate limiting.** Replace the `Map`-based limiter in `src/lib/rate-limit.ts` with a Redis- or DB-backed implementation before it is captured by a platform facade.

These fixes are not part of the architecture restructuring, but their landing gates Phase 1.

---

## 3. Product boundary

### 3.1 Conducting Core

Core must support the minimum reliable sacrament-meeting workflow:

- Authenticated user and active ward context.
- Meeting creation and lifecycle.
- Meeting date and meeting type at creation.
- Program items and their stable ordering.
- Speakers and speaker topics.
- Hymns, prayers, and basic business items.
- Meeting preparation view.
- At-the-Stand conducting view.
- Conducting notes required during the meeting.
- Basic program preview and print output.
- Publication of immutable `meeting_program_render` snapshots. The act of writing the immutable snapshot is a Core operation; sharing surfaces built on top of it are optional (see §3.3).
- Latest-meeting offline access and visible offline state.
- Core permissions, audit boundaries, and ward isolation.
- Shared navigation, errors, settings shell, and feature capability checks.

Core must remain usable if every optional module is disabled.

### 3.2 Platform services

Platform services are cross-cutting infrastructure, not optional product features:

- Authentication and session identity.
- Ward/stake tenancy context.
- Authorization and capability checks.
- PostgreSQL context and RLS integration.
- Audit event recording and redaction.
- Feature flags/module enablement.
- Event/outbox contracts.
- Offline context, snapshot, and mutation lifecycle.
- Shared error contracts.
- Media authorization primitives.
- Observability and health checks.

Platform services must not contain calling, membership, announcement, or conducting business rules.

### 3.3 Optional modules

Initial module candidates:

- Callings.
- Membership and LCR import.
- Announcements.
- Notifications.
- Interviews.
- Technology checklist.
- Public portal sharing UI, portal token administration, and access-request workflows (the immutable snapshot itself is Core; only the sharing surface is a module).
- Advanced spatial program designer.
- Document templates and template administration.
- Media library.
- Reports.
- Support administration.
- Calendar integrations.

These modules may integrate with Core through documented extension points, but Core must not require them for conducting.

### 3.4 Module classification rule

A capability is optional when all of the following are true:

1. A ward can conduct a sacrament meeting without it.
2. It has its own data lifecycle or permission set.
3. It can be disabled without corrupting Core data.
4. Its absence has an explicit fallback in Core.

If disabling it makes conducting impossible, either move the required portion into Core or split the capability into a Core adapter plus an optional enhancement.

---

## 4. Target repository structure

This is the target shape. Migration should be incremental; do not create every directory before its first vertical slice.

```text
packages/
  shared/                       # stable cross-app contracts and validators
  platform-contracts/           # optional later extraction; start in web/src/platform
  conducting-core/              # pure conducting domain, later extraction candidate
  module-contracts/             # extension-point types, later extraction candidate

apps/web/
  app/                          # thin Next.js pages and route adapters
  src/
    platform/
      auth/
      tenancy/
      permissions/
      audit/
      events/
      offline/
      feature-flags/
      errors/
    conducting/
      meetings/
      program-items/
      speakers/
      hymns/
      prayers/
      business/
      conducting-view/
      basic-rendering/
    modules/
      registry.ts
      callings/
      membership/
      announcements/
      notifications/
      interviews/
      technology/
      public-portal/
      advanced-program-designer/
      templates/
      media/
      reports/
    adapters/
      db/
      web/
      rendering/
```

### Initial implementation location

Do not immediately create new workspaces for every area. First establish the boundaries inside `apps/web/src/` so the migration remains low-risk. Extract a package only after the boundary has stable tests and no forbidden imports.

Likely first package extraction candidates:

1. `document-designer` pure model/projection/rendering.
2. `conducting-core` pure meeting/program types and rules.
3. `module-contracts` after two modules use the same extension points.

---

## 5. Module contract

The first registry should be internal and static. It should not load arbitrary code at runtime.

Conceptual contract:

```ts
export type StandModule = {
  id: string;
  name: string;
  version: string;
  defaultEnabled: boolean;
  requiredCapabilities: readonly string[];
  navigation?: readonly NavigationContribution[];
  meetingPanels?: readonly MeetingPanelContribution[];
  routes?: readonly RouteContribution[];
  permissions?: readonly PermissionContribution[];
  eventHandlers?: readonly EventHandlerContribution[];
  offlineScopes?: readonly OfflineScopeContribution[];
};
```

The actual contract should be designed before implementation and should remain smaller than this sketch unless a real use case requires each field.

### Required contract properties

- Stable module ID.
- Explicit enablement state.
- Declared permissions.
- Declared navigation/panel contributions.
- Typed event subscriptions.
- Explicit offline data ownership if applicable.
- No direct access to another module's tables.
- No implicit permission inheritance.
- No module code executed merely because a route is imported.

### Extension mechanisms

Use these in priority order:

1. Typed service calls for synchronous required behavior.
2. Typed domain events for loose coupling.
3. UI contributions for optional panels/navigation.
4. Feature flags for ward-level enablement.
5. Background outbox events for notifications and integrations.

Avoid a generic event bus for everything. Events must have named payload types and ownership documentation.

### Contract versioning discipline

Both module and event contracts carry a `version` field. To keep changes reviewable and to keep the agent from silently breaking downstream consumers, apply a semver-like rule:

- **Patch:** doc-only or non-observable refactor of the contract file.
- **Minor:** additive optional field, additive event, additive extension point. Existing consumers must keep type-checking without change.
- **Major:** any field removed, renamed, or type-narrowed; any required field added; any event payload shape change. Requires a paired codemod or migration note in the same PR and a note in `docs/architecture/module-contracts.md`.

A contract PR whose change is not marked patch/minor/major explicitly is rejected. The `docs:dependencies:check` gate should be extended to flag consumer files that import a bumped-major contract without being updated in the same PR.

---

## 6. Core contracts to stabilize first

### 6.1 Meeting context

```ts
export type MeetingContext = {
  userId: string;
  wardId: string;
  meetingId: string;
  meetingType: MeetingType;
  meetingDate: string;
};
```

The context must be validated server-side and must not be inferred from client navigation alone.

### 6.2 Program item contract

Program items need stable IDs and explicit presentation data:

- item ID
- meeting ID
- item type
- sequence/order
- title/label
- topic where applicable
- conducting state where applicable
- visibility/presentation behavior

Optional modules may reference program item IDs but must not silently rewrite Core ordering.

### 6.3 Core events

Start with a deliberately small event set:

- `MeetingCreated`
- `MeetingUpdated`
- `MeetingCompleted`
- `ProgramItemAdded`
- `ProgramItemUpdated`
- `ProgramItemRemoved`
- `SpeakerAssigned`
- `ProgramPublished`
- `MeetingContextChanged`

Every event needs:

- version
- ward ID
- actor ID
- aggregate ID
- occurred-at timestamp
- idempotency identity
- redaction rules

### 6.4 Rendering contract

Keep the basic Core output contract independent of the advanced designer:

```text
Core meeting/program data
  → target projection
  → basic renderer
```

The advanced designer may provide a richer renderer, but it must consume the same canonical program data and preserve a Core fallback.

### 6.5 Offline contract

Core owns the minimum offline snapshot. Optional modules declare additional scopes explicitly.

A module must identify:

- data it caches
- data it may mutate offline
- conflict strategy
- cleanup scope by user/ward/meeting
- behavior when disabled

No module may write private data into the Core offline store without a declared namespace and lifecycle.

---

## 7. Migration plan

### Phase 0: Architecture documentation and guardrails

**Goal:** Document the boundary without changing behavior.

**Create:**

- `docs/architecture/system-map.md`
- `docs/architecture/domain-boundaries.md`
- `docs/architecture/module-contracts.md`
- `docs/architecture/existing-file-map.md` — classifies every current directory under `apps/web/src/` and every top-level file (`bootstrap.mjs`, `health.mjs`, `version.mjs`) as **core**, **platform**, **optional module**, or **adapter**, using the §3.4 rule. Every current directory listed by `ls apps/web/src/` must appear. Ambiguous placements (`church-actions`, `leadership`, `notes`, `hardening`, `maintenance`, `reports`, `features`) must include a one-line justification.
- `apps/web/AGENTS.md`
- `apps/web/src/AGENTS.md`
- `apps/web/src/platform/AGENTS.md`
- `apps/web/src/conducting/AGENTS.md`
- `apps/web/src/modules/AGENTS.md`

**Modify:**

- `CLAUDE.md` to link to the architecture documents.
- `apps/web/package.json` `lint` script to include `src` (currently `eslint app components lib --max-warnings=0`), so `no-restricted-paths` rules added later can actually catch boundary violations.
- `apps/web/eslint.config.*` to add an `no-restricted-paths` (or equivalent `import/no-restricted-paths`) rule scaffold — initially empty of `zones`, ready to receive rules in Phase 1 and Phase 2.
- Regenerate `docs/DEPENDENCY_GRAPH.md` via `npm run docs:dependencies` and commit it so `docs:dependencies:check` is green before any subsequent phase lands.

**Verification:**

- Documentation review.
- No runtime behavior changes.
- `npm run lint` still passes with the expanded target.
- `npm run docs:dependencies:check` passes.
- `git diff --check`.

### Phase 1: Establish platform boundaries

**Prerequisite:** The two P0 remediations in §2.1 (RLS on the 17 tables and a non-in-memory rate limiter) must be merged first.

**Goal:** Make shared security and lifecycle services explicit.

**Likely files:**

- `apps/web/src/auth/*`
- `apps/web/src/db/context.ts`
- `apps/web/src/audit/service.ts`
- `apps/web/src/features/*`
- `apps/web/src/offline/*`
- `apps/web/src/notifications/*`
- New `apps/web/src/platform/*` facades and contracts.

**Work:**

- Define platform-facing interfaces.
- Keep existing implementations behind them.
- Preserve current RLS and ward checks.
- Do not move database tables yet.

**Tests:**

- Existing auth and RLS tests.
- Capability contract tests.
- Offline context isolation tests.
- Cross-ward rejection tests.

### Phase 2: Define Conducting Core

**Goal:** Make the sacrament-meeting workflow independently understandable and testable.

**Likely files:**

- Existing `apps/web/src/meetings/*`
- Existing `apps/web/src/stand/*`
- Existing meeting/program routes under `apps/web/app/api/w/[wardId]/meetings/*`
- New `apps/web/src/conducting/*` facades/types.
- `packages/shared/src/index.ts` for stable shared input/output contracts only.

**Work:**

- Identify the canonical meeting/program item model.
- Define Core service entrypoints.
- Keep route handlers as adapters.
- Separate conducting state from optional management workflows.
- Preserve current routes and database schema while callers migrate.

**Acceptance:**

- Core can create, prepare, conduct, complete, and reopen according to current policy.
- Core can render a basic program without optional modules.
- Existing meeting routes remain compatible.

### Phase 3: Add static module registry

**Goal:** Introduce optional capability registration without changing deployment.

**Create:**

- `apps/web/src/modules/registry.ts`
- `apps/web/src/modules/types.ts`
- `apps/web/src/modules/enablement.ts`
- A test harness (fixture/helper) that toggles module enablement per test — e.g. a `withModules({ callings: false, announcements: false, ... })` wrapper — used by a new "core-only" suite that boots the app with every optional module disabled and runs the full prep → conduct → publish → complete flow. Without this harness, "Core works with all optional modules disabled" is aspirational rather than tested.

**Contract scope:** ship the smallest viable subset of the §5 sketch — `id`, `name`, `defaultEnabled`, `navigation`, `routes`, `permissions`. `meetingPanels`, `eventHandlers`, `offlineScopes`, and `requiredCapabilities` are added only when a real module needs them.

**Modify:**

- Navigation composition.
- Feature-flag access.
- Shared error/permission handling.

**Tests:**

- Disabled module is absent from navigation and routes.
- Enabled module contributes only declared surfaces.
- Core works with all optional modules disabled (via the new harness).
- Ward A's enablement does not affect Ward B.

### Phase 4: Extract one low-risk module

**Recommended first module:** Notifications or Technology Checklist.

Do not start with Membership, LCR, or Public Portal. Those have heavier privacy, RLS, immutable-publication, or external-integration boundaries.

**Work:**

- Move module entrypoints behind the module contract.
- Keep existing tables and routes.
- Add module-owned permissions and tests.
- Subscribe to typed Core events instead of adding direct Core-to-module imports.

**Acceptance:**

- Module can be disabled.
- Core behavior and database isolation remain unchanged.
- Module tests are scoped and independently runnable.

### Phase 5: Extract advanced program designer

**Goal:** Make the spatial designer an optional enhancement over Core program data.

**Prerequisite (Phase 5a — must land before extraction):** Add a repository- and ward-level feature flag `advanced-designer` that disables the designer entirely — no nav, no routes, no edit surface, no advanced projection in the render pipeline. With the flag off, prep view, at-the-Stand view, publish, print, and PDF must all continue to work using the Core renderer. A dedicated flag-off test suite must cover preview, print, and PDF parity against a small fixture meeting. Extraction (Phase 5b) begins only after the flag-off suite is green in CI. This is the fallback the plan already promises, made testable before the surgery.

**Likely extraction:**

- Pure layout model, schemas, operations, projections, print layout, HTML renderer, and PDF renderer into a package or isolated module.
- Keep meeting data resolution, permissions, persistence, media authorization, and publication adapters in the web app.

**Canonical rule:**

- Advanced layout is canonical inside the designer.
- Legacy layout is an adapter at old boundaries.
- Core conducting does not depend on advanced layout editing.
- Basic program output remains available if the module is disabled.

**Tests:**

- Core fallback without advanced designer.
- Legacy-to-canonical conversion.
- Preview/print/PDF/publication parity.
- Lock and ward-boundary tests.
- Offline behavior if designer edits are supported offline.

### Phase 6: Extract remaining modules incrementally

Suggested order:

1. Technology checklist.
2. Notifications.
3. Callings.
4. Announcements.
5. Interviews.
6. Public Portal.
7. Membership/LCR imports.
8. Reports and support administration.

Reorder based on product priority, but do not extract a module until its ownership, permissions, persistence, and fallback are documented.

### Phase 7: Consider package extraction or external plugins

**Not now.** This phase exists to give the plan a shape past Phase 6, not to authorize the work. It must not be started, planned in detail, or scaffolded speculatively. The default answer to "should we extract packages now?" is no. Package extraction begins only after **all** of the following are true and have been separately authorized:

- At least two modules use stable contracts in production.
- Dependency rules are enforced by lint and by CI, not by convention.
- Module enablement is tested per ward end-to-end.
- Upgrade and rollback behavior is defined and rehearsed.
- The security model for third-party code is explicit and reviewed.
- The operational cost is justified by a real integration need with a named consumer.

This phase must not block the modular-monolith work and must not be used as a rationale for premature package boundaries in earlier phases.

---

## 8. Database and migration policy

Do not split the database immediately.

### Short term

- Keep the existing schema.
- Add ownership documentation for tables.
- Keep one forward migration per actual schema change.
- Preserve ward IDs, RLS policies, immutable publication rows, and stable references.
- Add module ownership metadata only when it solves a real query or migration need.

### Later, if needed

A module may receive a table ownership boundary, but shared tables must remain contract-driven:

- `meeting` and `meeting_program_item` remain Core-owned.
- Optional modules reference Core IDs.
- Optional modules do not duplicate meeting identity.
- Public render snapshots remain immutable and publication-owned.
- RLS must enforce module access through the same ward/stake context.

No database split is planned in the first implementation phases.

---

## 9. Agent development workflow after restructuring

Every future feature should begin with a module classification:

```text
Core change
Platform change
Existing module change
New optional module
Cross-module contract change
```

The plan must name:

- owning module
- consumed contracts
- new events, if any
- persistence ownership
- permission boundary
- offline namespace, if any
- public/print/rendering surfaces
- fallback when disabled
- focused tests
- full verification gates

The agent should normally load:

1. Root `CLAUDE.md`.
2. The owning directory's `AGENTS.md`.
3. The module contract.
4. The module's current tests.
5. Only the connected route/repository files.

No feature should begin by reading the entire repository unless the dependency map proves that it crosses domains.

### Required implementation loop

1. Write or update the plan.
2. Add/adjust contract tests.
3. Make one vertical slice.
4. Run focused tests.
5. Review exact tree.
6. Run full tests, typecheck, lint, build, dependency checks, and relevant E2E/RLS checks.
7. Commit one coherent change.

---

## 10. Non-goals

This plan does not authorize:

- Rewriting the entire application.
- Replacing PostgreSQL or Drizzle.
- Splitting into microservices.
- Creating a third-party plugin marketplace.
- Allowing arbitrary plugin code execution.
- Moving every current file immediately.
- Changing Church policy workflows without separate policy review.
- Changing current meeting behavior merely to fit the architecture.
- Changing production deployment.
- Migrating existing data before compatibility adapters and tests exist.

---

## 11. Risks and mitigations

### Risk: Core becomes a dumping ground

**Mitigation:** Require a module classification and reject optional business rules in Core.

### Risk: Contracts become too generic

**Mitigation:** Start with the smallest real extension points. Add a field only when a second module needs it.

### Risk: Module boundaries hide security bugs

**Mitigation:** Enforce authorization in platform/domain services and database/RLS. Module registration must never grant permissions implicitly.

### Risk: Offline state becomes fragmented

**Mitigation:** Platform owns lifecycle and context generation. Modules own declared namespaced data only.

### Risk: Public rendering leaks module data

**Mitigation:** Public projection remains explicit and target-specific. Published output uses immutable snapshots.

### Risk: Extraction causes a large rewrite

**Mitigation:** Use facades and adapters first. Move implementation only after contracts and tests are stable.

### Risk: Agent still reads too much

**Mitigation:** Add directory guidance, architecture maps, dependency checks, module-scoped test commands, and a required owning-module field in every plan.

---

## 12. Acceptance criteria for the architecture work

The architecture effort is successful when:

- Core conducting works with optional modules disabled.
- New optional capabilities have a documented owner and fallback.
- Core does not import optional modules.
- Routes are adapters rather than multi-domain business orchestrators.
- Module permissions are explicit and ward-scoped.
- Module data has clear persistence ownership.
- Core and module offline data have declared namespaces and cleanup behavior.
- Public, print, and digital projections have explicit target contracts.
- The agent can identify the owning module and relevant files without reading the whole repository.
- A feature can be tested with a focused module command plus the normal full gates.
- Existing behavior and legacy data remain compatible throughout migration.

---

## 13. Verification plan

Architecture/documentation phase:

```bash
git diff --check
npm run docs:dependencies:check
```

Each implementation phase, as applicable:

```bash
npm run test --workspace @the-stand/web -- --run <focused-tests>
npm run typecheck --workspace @the-stand/web
npm --workspace @the-stand/web run lint
npm run test --workspace @the-stand/web -- --run
npm run build --workspace @the-stand/web
npm run docs:dependencies:check
git diff --check
```

Additional gates must be reported separately:

- PostgreSQL migration/RLS tests.
- Playwright/browser acceptance.
- Redis/outbox behavior.
- GitHub CI and CodeQL.
- Dev/staging deployment.
- Production deployment.

A passing TypeScript build is not proof that module boundaries, RLS, offline cleanup, or browser behavior work.

---

## 14. Execution boundary

This document records the proposed architecture and migration plan. It does not authorize implementation.

Implementation begins only after an explicit instruction such as:

> “Implement Phase 0.”

The first implementation PR should be documentation and dependency-boundary scaffolding only. It should not move production code or change runtime behavior unless separately authorized.
