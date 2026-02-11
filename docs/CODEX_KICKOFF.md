# CODEX_KICKOFF.md — One-pass repo bootstrap prompt

Paste this into Codex to scaffold the repo structure and wire up scripts.

---

You are building The Stand.
Rules:
- Follow docs in /docs (SRS, ARCHITECTURE, SCHEMA, API, UI, PERMISSIONS, ACCEPTANCE, PLANS).
- Ward isolation is mandatory: API checks + Postgres RLS.
- Public endpoints never accept ward_id.
- Support Admin bootstrap (Option 1): generate random password, print once to logs, must_change_password forced flow.
- Use stack: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Auth.js + Drizzle + Postgres + (optional) BullMQ/Redis.
- Do not invent features not specified.

Task:
1) Create a monorepo with:
   - apps/web (Next.js app; UI + API routes)
   - packages/shared (zod validators + types)
   - docs/ (already exists)
   - infra/ (already exists)
2) Add scripts:
   - npm run lint, typecheck, test, build, start
   - npm run migrate
   - npm run worker (if BullMQ used)
3) Add Drizzle schema + migrations folder and implement a migration runner.
4) Implement minimal /health endpoint (db check) and /api/me.
5) Ensure `npm run build` succeeds and CI passes.

When done:
- Output a short summary of what you created
- List remaining Milestone next steps from PLANS.md

---
