# The Stand system map

## Phase 0 status

This document records the intended modular-monolith shape. Phase 0 changes documentation and guardrails only. Existing runtime directories remain in place until a later vertical slice proves a boundary.

## Current deployable shape

```text
Next.js application (apps/web)
├── app/                 Pages, layouts, API route adapters
├── components/          React UI components
├── lib/                 Web-facing utilities
└── src/
    ├── platform-like services and adapters
    ├── conducting workflow logic
    └── optional capability areas

PostgreSQL + Drizzle
├── ward-scoped data and RLS
├── immutable published render snapshots
└── audit and outbox records

Redis/BullMQ
└── rate limits and asynchronous notification work

packages/shared
└── shared TypeScript and validation contracts
```

## Target dependency direction

```text
platform services
        ↓
conducting-core contracts and implementation
        ↓
optional modules
        ↓
web, database, rendering, and integration adapters
```

The arrows describe allowed consumption, not a required directory move. In particular:

- Core must not import optional modules.
- Platform must not contain conducting, calling, membership, or announcement rules.
- Optional modules may consume Core contracts and Platform services.
- Adapters translate framework, persistence, rendering, and external-system concerns.
- A module must not reach through another module into its repository or tables.

## Protected Core workflow

The protected product center is sacrament-meeting preparation and conducting:

1. Authenticate a user and establish an active ward context.
2. Create or open a meeting with date and type.
3. Prepare ordered program items, speakers, hymns, prayers, and basic business.
4. Conduct the meeting, including required conducting notes.
5. Render a basic preview/print output.
6. Publish an immutable `meeting_program_render` snapshot.
7. Complete or reopen the meeting according to current behavior.
8. Preserve the minimum offline snapshot and visible offline state.

Every optional module needs an explicit fallback when disabled. Core data and stable IDs remain authoritative; modules may extend the workflow but may not silently rewrite Core ordering or ownership.

## Cross-cutting platform concerns

Platform owns identity, ward/stake context, authorization, RLS context, audit redaction, feature enablement, event/outbox contracts, offline lifecycle, errors, media authorization primitives, health, and observability. These services provide boundaries; they do not decide business policy for optional capabilities.

## Adapter surfaces

The Next.js `app/` tree, database access, renderers, PDF/print output, worker entrypoints, imports, and external integrations are adapters around domain and platform contracts. Existing code may combine roles today. The file map records the intended ownership without claiming that the current implementation has already been separated.

## Phase 0 non-goals

- No source-directory moves.
- No module registry implementation.
- No database migration or table ownership change.
- No route behavior change.
- No production deployment change.
