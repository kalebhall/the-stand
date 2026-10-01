# Programs extraction decision

**Decision:** Keep Programs as an internal modular capability of The Stand. Do not extract a standalone product at this time.

**Decision date:** 2026-09-30

## Evidence

Milestones 0–5 established reusable contracts, source adapters, ward-scoped persistence, publication snapshots, authenticated editing, immutable public publication, authenticated print rendering, and a versioned public baptism feed.

The current evidence does not satisfy the extraction threshold:

- There is one demonstrated non-sacrament program type: baptism.
- Programs still depends on The Stand for ward context, authentication, permissions, source records, and Church operational data.
- No requirement for independent account ownership or billing has been established.
- The feed contract exists, but no external consumer has been established.
- Generic persistence and permissions are usable, but broader production validation remains incomplete.
- A second deployment would add operational cost without a demonstrated user or business need.

## Consequences

- Continue investing in typed internal Programs contracts and static registration.
- Keep source-of-truth data in The Stand and use one-way adapters into Programs.
- Preserve ward isolation, PostgreSQL RLS, authenticated authorization, immutable publication history, and explicit public projections.
- Treat the public feed as an integration boundary, not evidence that Programs should become a separate service.
- Revisit extraction only when multiple program types are in real use, independent ownership is required, or external feed consumers justify separate operations.

## Revisit triggers

Reopen this decision when at least one of the following is demonstrated with concrete product evidence:

1. Multiple non-Stand program types are used in production.
2. Users need Programs without The Stand's ward and meeting operations.
3. Independent account ownership, tenancy, or billing is required.
4. External systems consume the versioned feed.
5. Generic persistence and permissions are stable under sustained use.
6. The operational cost of a second deployment is justified.

This is an evidence-based hold, not a permanent rejection of extraction.
