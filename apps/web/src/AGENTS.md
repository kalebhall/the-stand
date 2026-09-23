# Source architecture guidance

Classify every change as Platform, Conducting Core, Optional Module, Adapter, or a cross-boundary contract change before editing.

Read the relevant architecture documents under `docs/architecture/` and inspect the dependency graph before broadening scope. The existing directories are classified in `existing-file-map.md`; that map is an ownership decision for migration, not proof that current imports already obey it.

Rules:

- Core must not import optional modules.
- Platform must not contain business rules for callings, membership, announcements, or conducting.
- Optional modules may consume Core contracts and Platform services, but not another module's persistence internals.
- Adapters translate HTTP, UI, SQL/Drizzle, rendering, workers, and external integrations.
- Enforce ward/capability/privacy boundaries server-side and in PostgreSQL/RLS.
- Preserve Core fallbacks, stable IDs, immutable publication snapshots, and offline cleanup behavior.

No directory move is justified by a filename alone. Trace imports/callers, add focused tests, and review the exact tree after every boundary change.
