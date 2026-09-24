# Platform guidance

Platform services are cross-cutting infrastructure: identity, ward/stake tenancy, authorization, PostgreSQL/RLS context, audit, feature enablement, events/outbox, offline lifecycle, errors, media authorization primitives, health, and observability.

Platform must not encode calling, membership, announcement, interview, or conducting business rules. Keep interfaces narrow and fail closed. Preserve server-side ward/capability checks and explicit PostgreSQL predicates.

When adding a platform facade:

- define the contract before moving an implementation;
- keep the current behavior behind the facade;
- document ownership, error behavior, and privacy scope;
- add focused tests plus cross-ward/RLS tests where relevant;
- update the dependency graph and run full verification.
