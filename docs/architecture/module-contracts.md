# Module contracts

## Phase 0 contract position

The first registry is a future static in-process registry. Phase 0 defines the contract vocabulary only. It does not create a registry, load modules, change navigation, or change route behavior.

Do not support arbitrary runtime code, third-party installation, or separate deployments as part of the modular-monolith work.

## Smallest initial contract

The initial contract should remain deliberately small:

```ts
export type StandModule = {
  id: string;
  name: string;
  version: string;
  defaultEnabled: boolean;
  navigation?: readonly NavigationContribution[];
  routes?: readonly RouteContribution[];
  permissions?: readonly PermissionContribution[];
};
```

`meetingPanels`, `eventHandlers`, `offlineScopes`, and `requiredCapabilities` are deferred until a real module needs them. Do not add generic fields speculatively.

The contribution types must be typed, owned, and explicit. They are placeholders for Phase 3 design, not an instruction to add `any`-typed extension points now.

## Required properties

Every module contract must provide or define:

- a stable module ID;
- a human-readable name;
- a semver-like contract version;
- default enablement behavior;
- explicit permission contributions;
- explicit navigation and route contributions when applicable;
- a persistence owner for every module-owned record;
- disabled behavior and Core fallback;
- ward-scoped enablement where the capability is ward-specific.

A module must not receive permissions merely by being registered.

## Boundary ownership

- Core owns meeting identity, ordered program items, conducting state, basic rendering, and immutable publication snapshots.
- Platform owns identity, context, authorization, audit, events, offline lifecycle, errors, and enablement primitives.
- Modules own their capability workflows and module-specific persistence.
- Adapters own translation to HTTP, UI, SQL/Drizzle, print/PDF, workers, and external systems.

Modules reference Core IDs through contracts. They do not import another module's repositories or tables.

### Programs contract

Programs currently exposes a small static contract in `apps/web/src/programs/`:

- `ProgramDocument` identifies a program type, source reference, schema version, metadata, and payload.
- `ProgramSourceAdapter` translates a source record into editor data, render input, and a program document.
- `PROGRAM_REGISTRY` statically registers the supported type/source pair; it is not runtime plugin loading.
- `service.ts` is the narrow lookup/build boundary; unsupported program types fail before adapter work.
- `persistence.ts` is a compatibility facade over legacy meeting-document storage; it does not create a second source of truth.
- `SACRAMENT_PROGRAM` with `STAND_MEETING` is the first registration.

The sacrament adapter may use existing document-designer services during migration, but future modules must not reach through it into meeting repositories. Public output remains snapshot-based and private source fields remain outside the public render input.

## Extension mechanisms

Use these in order of necessity:

1. Typed service calls for required synchronous behavior.
2. Named, versioned domain events for loose coupling.
3. UI contributions for optional panels and navigation.
4. Ward-level feature flags for enablement.
5. Outbox events for notifications and integrations.

Do not create a generic event bus for all behavior. Every event needs a named payload, owner, version, ward ID, actor ID, aggregate ID, occurrence time, idempotency identity, and redaction rules.

## Versioning

Mark every contract change as one of:

- **Patch:** documentation-only or non-observable refactor.
- **Minor:** additive optional field, event, or extension point that keeps consumers type-checking.
- **Major:** removal, rename, type narrowing, required field, or payload change. A major change requires a migration note and consumer updates in the same change.

The dependency graph and lint guardrails are documentation/enforcement groundwork. They do not yet enforce consumer updates for major contract changes.

## Disabled-module contract

For each module, later implementation work must state:

- what disappears from navigation and routes;
- what Core fallback remains;
- which data remains readable or is hidden;
- what happens to pending offline mutations;
- whether existing module data is retained, archived, or migrated;
- which focused and core-only tests prove the disabled path.
