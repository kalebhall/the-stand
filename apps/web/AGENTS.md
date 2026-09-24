# Web app guidance

`apps/web` is the Next.js application and adapter boundary for The Stand.

## Phase 0 architecture guardrails

- Treat `docs/architecture/system-map.md`, `domain-boundaries.md`, `module-contracts.md`, and `existing-file-map.md` as the current architecture contract.
- Phase 0 does not move runtime files or change behavior.
- Keep the sacrament-meeting conducting workflow usable when optional capabilities are disabled.
- Preserve ward isolation, RLS, audit behavior, immutable public snapshots, and offline lifecycle rules.
- Routes and pages are adapters. Do not add cross-domain orchestration to route handlers.
- Do not import an optional module from Core. Do not reach through one module into another module's repository or tables.

## Verification

From the repository root, run the dependency graph generation/check and `git diff --check`. For source changes also run the owning workspace tests, typecheck, lint, and build. Keep database/RLS and browser gates separate from static checks.
