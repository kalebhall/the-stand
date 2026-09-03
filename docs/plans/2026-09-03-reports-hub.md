# Reports Hub Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add ward-scoped planning reports for speaker frequency, speaker topics, hymn frequency, prayer frequency, assignment balance, and program completeness.

**Architecture:** Extend the existing authenticated `/reports` route instead of creating separate report pages. Keep aggregation queries in a typed server-side report module, with explicit date filters and ward scoping. Keep private/internal note visibility rules separate from participation history; reports expose structured meeting data only to authorized ward users.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL raw SQL through `pg`, Vitest, Tailwind CSS.

---

## Initial release scope

1. Speaker frequency and last talk date.
2. Speaker topic history.
3. Hymn frequency by position and last use.
4. Prayer frequency and last assignment.
5. Assignment overview for people with recorded talks/prayers.
6. Program completeness warnings.
7. Date filters and compact report cards.

Out of scope for first release: automated assignment recommendations, public reports, private-note export, charts requiring a new visualization dependency, and demographic scoring.

## Privacy and product rules

- Every query is scoped by authenticated active ward.
- Reports are available only to the existing internal-report permission boundary.
- Private notes never appear in participation reports.
- Use factual labels such as “recorded assignments” and “last recorded talk,” not judgments or rankings.
- Show a clear empty/data-limitation state when historical meetings lack structured member identity.
- Keep CSV/PDF export as a follow-up after report content is verified.

## Tasks

### Task 1: Add typed aggregation module

**Files:**
- Create: `apps/web/src/reports/aggregations.ts`
- Test: `apps/web/src/reports/aggregations.vitest.ts`

Add pure row-shaping helpers and typed report row contracts. Keep SQL in the route for the first vertical slice only if query mocks make extraction safer; otherwise expose one `loadReportData(client, { wardId, from, to })` function with explicit PostgreSQL parameter casts.

### Task 2: Add speaker and topic report queries

**Files:**
- Modify: `apps/web/src/reports/aggregations.ts`
- Test: `apps/web/src/reports/aggregations.vitest.ts`

Query completed/recorded meeting program items with `item_type = 'SPEAKER'`, join members by ward and stored title where possible, count assignments, calculate last recorded date, and return topic history. Do not infer “never spoke” for members absent from program history until a member roster comparison is explicitly added.

### Task 3: Add hymn and prayer report queries

**Files:**
- Modify: `apps/web/src/reports/aggregations.ts`
- Test: `apps/web/src/reports/aggregations.vitest.ts`

Aggregate hymns by `hymn_number`, `hymn_title`, and item position/type. Aggregate invocation/benediction/prayer rows by stored title/member match. Preserve date filtering and ward scoping.

### Task 4: Add program completeness query

**Files:**
- Modify: `apps/web/src/reports/aggregations.ts`
- Test: `apps/web/src/reports/aggregations.vitest.ts`

Return actionable warnings for speaker items missing a topic, speaker/member identity match, hymn details, or required prayer assignment. Keep warnings tied to meeting date and item title.

### Task 5: Replace notes-only reports UI with reports hub

**Files:**
- Modify: `apps/web/app/reports/page.tsx`

Keep existing note report filters and privacy rules. Add date-filtered cards/sections for speakers, topics, hymns, prayers, and completeness. Use compact lists before adding charts. Display counts, last-use dates, and empty states.

### Task 6: Verify and ship

Run:

```bash
npm run docs:dependencies
npm run docs:dependencies:check
git add docs/DEPENDENCY_GRAPH.md
npm test
npm run typecheck
npm run build
git diff --check
```

Then inspect branch/PR state, commit, push, create a PR, read it back, and report CI honestly.
