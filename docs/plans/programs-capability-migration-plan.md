# Programs Capability Expansion Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Evolve the current sacrament-meeting Program Designer into a reusable Programs capability while keeping The Stand's meeting preparation and conducting workflow as the protected Core.

**Architecture:** Keep the capability inside The Stand as a modular-monolith feature. The Stand remains authoritative for wards, meetings, members, callings, conducting, announcements, permissions, and published historical data. Programs owns reusable document composition, templates, layouts, and rendering; typed source adapters translate Stand data into program documents. Do not create a separate deployment or runtime plugin system yet.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Zod, PostgreSQL/Drizzle, PostgreSQL RLS, immutable publication snapshots, Vitest, Playwright, existing document-designer registry and renderers.

---

## Decision

**Build Programs inside The Stand first, with an extraction seam—not as a separate product now.**

The first supported source remains `STAND_MEETING` / `SACRAMENT_PROGRAM`. Future sources such as baptisms, funerals, devotionals, youth events, and manually created programs must enter through explicit adapters. No external consumer gets direct database access. A future external product, if justified by actual adoption, consumes a versioned feed or published snapshot API.

## Current execution status

**Complete — Milestone 1, Tasks 1–6.** The static registry is now consumed through a typed Programs service boundary. Unsupported program types fail before adapter work, source versions flow into stable source references, and the sacrament adapter remains the only registered implementation. Navigation, permissions, routes, persistence, and public behavior remain unchanged. Milestone 2 is next: add a generic persistence facade over the existing meeting/document records.

First-slice files:

- `apps/web/src/programs/contracts.ts`
- `apps/web/src/programs/source-adapter.ts`
- `apps/web/src/programs/sacrament-meeting-adapter.ts`
- `apps/web/src/programs/sacrament-meeting-adapter.vitest.ts`
- `apps/web/src/programs/registry.ts`
- `apps/web/src/programs/registry.vitest.ts`
- `apps/web/src/programs/service.ts`
- `apps/web/src/programs/service.vitest.ts`

Architecture updates:

- `docs/architecture/domain-boundaries.md`
- `docs/architecture/module-contracts.md`
- `docs/architecture/system-map.md`
- `docs/architecture/existing-file-map.md`

Evidence: the repository test command passed with **702 tests passed and 11 skipped**, including live PostgreSQL/RLS suites; typecheck, lint, production build, dependency graph check, and `git diff --check` passed.

## Current repository facts

- The protected Core is sacrament-meeting preparation, conducting, basic rendering, immutable publication, and minimum offline access (`docs/architecture/domain-boundaries.md`, `docs/architecture/system-map.md`).
- The existing designer is strongly typed around `documentType: 'SACRAMENT_PROGRAM'` (`apps/web/src/document-designer/types.ts`).
- Block definitions and publication-safety rules are registered in `apps/web/src/document-designer/sacrament-program.ts` and `registry.ts`.
- Templates already have lifecycle, version, scope, distribution, and publication routes under `apps/web/app/api/w/*/document-templates` and `apps/web/app/programs/templates`.
- Published public output uses immutable meeting snapshots; this behavior must not be replaced by live draft reads.
- Existing meeting program persistence and public rendering are meeting-shaped. They should be preserved behind adapters while the generic contract is introduced.
- Ward isolation, RBAC, RLS, audit logging, offline cleanup, and privacy boundaries are non-negotiable.

## Target ownership

### The Stand Core owns

- Meeting identity and status
- Ward/member/calling identity
- Speakers, hymns, prayers, business, and conducting data
- At-the-Stand operation
- Core permissions and audit boundaries
- Stable source IDs
- Published meeting history and core public snapshots

### Programs capability owns

- Program document identity and metadata
- Program type and source reference
- Layout, blocks, ordering, themes, and templates
- Program editing and validation
- Publication snapshots for program output
- Print, PDF, digital, and public render adapters
- Program-editor permissions and template selection rules

### Source adapters own

- Translation from a source domain into program data
- Source-specific block availability and defaults
- Source-specific privacy/publication rules
- Version and freshness metadata
- Compatibility with existing meeting-shaped persistence during migration

## Dependency rules

- Core must not import Programs implementation details.
- Programs may consume typed Core contracts, never Core repositories or tables directly.
- Adapters may call domain services and repositories but must not become cross-domain orchestrators.
- Public routes consume immutable, explicitly published snapshots only.
- No generic runtime plugin marketplace, third-party code loading, or separate deployment in this plan.
- No direct external-system writes; future feeds are read-only/versioned unless separately approved.

---

# Milestones

## Milestone 0 — Contract and inventory baseline

**Outcome:** The generic boundary is explicit without changing runtime behavior.

### Tasks

1. Define the canonical `ProgramDocument`, `ProgramSourceRef`, `ProgramType`, and `ProgramPublication` contract in a new Programs domain module.
   - Candidate file: `apps/web/src/programs/contracts.ts`
   - Keep the first contract small: identity, type, source reference, metadata, layout payload, schema version, and publication target.
   - Do not add speculative event buses, plugin hooks, or arbitrary `any` extension fields.

2. Define the first source adapter interface.
   - Candidate file: `apps/web/src/programs/source-adapter.ts`
   - Required operations: resolve source identity, produce safe editor data, produce render input, report source version, and classify private/public fields.

3. Add a sacrament adapter facade around existing meeting/document-designer behavior.
   - Candidate file: `apps/web/src/programs/sacrament-meeting-adapter.ts`
   - Initial implementation delegates to existing meeting program data; it must not move tables or routes yet.

4. Add contract tests for stable IDs, source/type discrimination, schema-version handling, and public/private field separation.
   - Candidates: `apps/web/src/programs/contracts.vitest.ts`, `apps/web/src/programs/sacrament-meeting-adapter.vitest.ts`

5. Update `docs/architecture/module-contracts.md`, `docs/architecture/domain-boundaries.md`, and `docs/architecture/existing-file-map.md` with the Programs ownership and adapter boundary.

### Gate

Focused contract tests, typecheck, dependency graph check, and exact-tree review. No database or route behavior changes in this milestone.

## Milestone 1 — Programs registry without runtime plugin loading

**Outcome:** Program types and source adapters are statically registered and discoverable.

### Tasks

1. Create a typed static registry for program types and adapters.
   - Candidate: `apps/web/src/programs/registry.ts`
2. Register `SACRAMENT_PROGRAM` as the first type.
3. Add registry validation for duplicate IDs, unsupported source types, and contract-version mismatches.
4. Add tests for the enabled path and an unknown/disabled program type.
5. Keep navigation and permissions unchanged until the registry is consumed by a real route.

### Gate

Registry tests, full unit suite, typecheck, lint, build, dependency graph check.

## Milestone 2 — Generic persistence facade, preserving legacy storage

**Outcome:** New code can work with generic Programs contracts while existing meeting tables remain authoritative during migration.

### Tasks

1. Map existing `meeting_document`, `meeting_program_render`, and template records into the generic contract.
2. Add repository/service facades under `apps/web/src/programs/` rather than adding a new table immediately.
3. Add explicit source/type fields only when the existing schema cannot represent the contract safely.
4. If a migration is required, add a forward migration with ward scope, indexes, foreign keys, RLS, and audit ownership.
5. Preserve stable meeting IDs and published snapshot IDs.
6. Add compatibility tests proving old meeting programs still load and publish through the facade.

### Gate

Live PostgreSQL/RLS tests, migration tests, compatibility tests, and cross-ward denial tests.

## Milestone 3 — Route and UI extraction

**Outcome:** The current Program Designer uses the Programs facade while users see no regression.

### Tasks

1. Keep existing sacrament routes as compatibility adapters:
   - `/api/w/[wardId]/meetings/[meetingId]/program-design`
   - `/api/w/[wardId]/meetings/[meetingId]/program-design/validate`
   - `/api/w/[wardId]/meetings/[meetingId]/program-design/pdf`
   - `/programs/[meetingId]`
2. Add a generic internal Programs route shape only after the facade has coverage.
3. Preserve `PROGRAM_EDITOR` boundaries: program preparation and program announcements, but not At-the-Stand announcements, conducting, users, ward settings, or meeting completion.
4. Keep template administration under Administration; Programs may select and apply approved templates.
5. Add route authorization tests for ward mismatch, role denial, disabled capability, and public/private output.

### Gate

Route tests, browser acceptance for the existing sacrament workflow, full tests, typecheck, lint, build, and exact-tree review.

## Milestone 4 — Second program type

**Outcome:** The abstraction is proven by one non-sacrament workflow.

Recommended first candidate: **baptism program** or **funeral program**, selected based on actual ward workflow priority.

### Tasks

1. Define the source data contract and privacy rules for the selected event.
2. Add one adapter and a deliberately small template set.
3. Reuse generic layout, editing, publication, and print infrastructure.
4. Do not expose meeting-only blocks or At-the-Stand controls for the new program type.
5. Add complete authorization, public snapshot, privacy, and localization coverage.

### Gate

End-to-end creation, edit, publish, print/public rendering, ward isolation, and disabled-path tests.

## Milestone 5 — Versioned feed/export contract

**Outcome:** Other systems can consume approved program data without direct database access.

### Tasks

1. Define a versioned read-only feed based on published snapshots.
2. Include source identity, program type, publication version, render targets, and explicit public-safe fields.
3. Add stable token access, revocation/expiration policy, rate limiting, and audit logging where a public link is used.
4. Never expose private notes, unpublished assignments, internal source IDs, or live drafts.
5. Add contract fixtures for an external consumer without creating a second application.

### Gate

API contract tests, public privacy tests, abuse/rate-limit tests, and immutable snapshot verification.

## Milestone 6 — Extraction decision

**Outcome:** Make a data-based decision about a standalone Programs product.

Extract only if all or most of these are true:

- Multiple non-Stand program types are in real use.
- Users need programs without ward/meeting operations.
- Independent account ownership and billing are required.
- The feed contract has external consumers.
- Generic persistence and permissions are stable.
- The operational cost of a second deployment is justified.

If not, keep Programs as a modular capability in The Stand.

---

# First execution slice

Start with **Milestone 0, Tasks 1–3**. This is the smallest useful architectural step and does not change user-visible behavior:

1. Add the generic Programs contract types.
2. Add the source-adapter interface.
3. Wrap existing sacrament meeting behavior in the first adapter facade.
4. Add contract tests before changing routes or persistence.

The first implementation must not:

- Rename or delete existing meeting tables.
- Change public routes.
- Change `PROGRAM_EDITOR` permissions.
- Add a second deployment.
- Add a runtime plugin loader.
- Alter At-the-Stand behavior.

# Verification policy

Run and report these separately for every implementation milestone:

1. Focused domain/route/component tests.
2. Full unit/component suite.
3. Live PostgreSQL/RLS and migration tests.
4. Typecheck.
5. Lint.
6. Production build.
7. Dependency graph generation/check.
8. `git diff --check`.
9. Browser acceptance for changed authenticated/public flows.
10. Fresh exact-tree review after the final patch.

A passing build is not evidence of authorization, RLS, privacy, public snapshot, offline, or browser correctness.

# Explicit non-goals

- No standalone product extraction in the first milestones.
- No microservices or runtime plugin marketplace.
- No direct LCR or other Church-system integration.
- No cross-ward sharing.
- No live-draft public feed.
- No broad rewrite of the existing document designer.
- No speculative support for every possible event type before the second type proves the abstraction.

# Open decisions before Milestone 4

- Which second program type provides the most immediate ward value: baptism, funeral, devotional, or another event?
- Should generic Programs use the existing document-designer JSON as its first persistence payload, or introduce a versioned wrapper around it?
- Which published snapshot route is the future feed contract: existing public program routes, a new JSON endpoint, or both?
- What exact offline behavior is required for non-sacrament programs?
