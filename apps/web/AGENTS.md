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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
