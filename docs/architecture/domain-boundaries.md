# Domain boundaries

## Classification rule

A capability is an **optional module** only when all four §3.4 conditions hold:

1. A ward can conduct a sacrament meeting without it.
2. It has its own data lifecycle or permission set.
3. It can be disabled without corrupting Core data.
4. Core has an explicit fallback when it is absent.

If disabling a capability makes conducting impossible, the required portion belongs in Core. An optional enhancement may remain a module behind a Core adapter.

## Categories

### Platform

Cross-cutting infrastructure used by more than one business area:

- authentication and session identity;
- ward/stake tenancy and database context;
- authorization, capabilities, and RLS integration;
- audit recording and redaction;
- feature flags and module enablement;
- typed errors, events, and outbox contracts;
- offline context and lifecycle;
- health, hardening, maintenance, localization, and shared utilities.

Platform code must not encode calling, membership, announcement, interview, or conducting policy.

### Conducting Core

Core owns the minimum sacrament-meeting workflow: meetings, ordered program items, speakers, hymns, prayers, basic business, preparation, At-the-Stand conducting, required conducting notes, basic rendering, immutable publication snapshots, minimum offline access, and the permissions/audit boundaries needed to operate it.

Core may depend on Platform. Core must not import Optional Modules.

### Optional module

An optional module owns a capability that can be disabled with a documented fallback. Initial candidates include callings, membership/LCR import, announcements, notifications, interviews, technology checklists, public sharing surfaces, advanced program design, templates, media, reports, and calendar integrations.

Optional modules may consume Core contracts and Platform services. They must not import another module's persistence internals.

### Adapter

Adapters translate between a boundary and an external representation: Next.js routes/pages, database repositories, print/PDF/HTML output, workers, import runners, and external integrations. An adapter may be physically colocated with a domain area during migration, but its contract and authorization remain explicit.

## Boundary rules

- Route handlers are adapters, not multi-domain orchestrators.
- Database/RLS predicates remain defense in depth even when route authorization exists.
- Public output consumes explicit immutable snapshots and never draft/private records.
- Core IDs and ordering remain stable when modules contribute behavior.
- Optional modules declare permissions, enablement, persistence ownership, offline scope, and disabled behavior.
- Cross-module communication uses typed service calls or named versioned events, not repository access.
- A broad permission must not silently substitute for a narrower module capability.
- Architecture documentation must not be treated as evidence that a runtime boundary already exists.

## Migration rule

Phase 0 documents the intended boundary. Later phases must introduce facades and tests before moving implementations. Each move must preserve ward isolation, RLS, audit behavior, immutable publication, offline cleanup, and existing route compatibility.
