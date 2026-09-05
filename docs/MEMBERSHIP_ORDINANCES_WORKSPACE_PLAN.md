# Membership & Ordinances Workspace Implementation Plan

> **For Hermes:** Implement this plan task-by-task. Keep membership actions and priesthood preparation separate from calling lifecycle records and from public meeting-program content.

**Goal:** Give authorized ward leaders a dedicated Membership & Ordinances workspace for planning and completing follow-up while preserving meeting-level and At-the-Stand integration.

**Architecture:** Keep `meeting_membership_ordinance` as the current ward-scoped source of truth. Add a ward-level read/workspace surface over those records instead of creating duplicate action records. Meeting edit and At-the-Stand pages remain the presentation and conducting surfaces; the workspace owns cross-meeting tracking, filtering, and follow-up visibility.

**Tech Stack:** Next.js App Router, TypeScript, raw `pg` queries with RLS context, existing role guards, React client components, Vitest.

---

## Product decisions

- Membership and ordinance actions are not calling assignments and must not use calling sustain/release/set-apart controls.
- An action may be linked to a meeting for planned presentation, but its follow-up status belongs to the action record.
- The workspace is leadership-only. It must never appear in public or printed programs.
- Keep sensitive data minimal: store operational status, dates, responsible leader, and notes needed for coordination. Do not copy ordinance records or interview content from Church systems.
- Use one action record across the workspace, meeting editor, and At-the-Stand. Do not create a second permanent workspace table.

## First slice being implemented now

- Add `/membership-ordinances` navigation for meeting-management roles.
- Add a ward-scoped server page that lists current membership and priesthood actions.
- Group records into **Needs attention**, **Upcoming**, and **Completed**.
- Show member, action type, meeting/date, responsible leader, interview/LCR flags, and current status.
- Link each record back to its meeting editor.
- Preserve existing meeting and At-the-Stand controls unchanged.

## Follow-up slices

### Phase 2: Shared domain vocabulary

- Centralize action labels, status labels, interview labels, and LCR follow-up labels in `apps/web/src/church-actions/membership-ordinance.ts`.
- Add pure helpers for grouping, overdue detection, and next-action labels.
- Add tests for every action type, status, completed-with-LCR-needed state, and overdue planned date.

### Phase 3: Workspace filters and actions

- Add client-side filters for action family, status, interview needed, LCR update needed, overdue, and date range.
- Add explicit status actions from the workspace using the existing ward/meeting/action API routes.
- Keep transitions server-authoritative and display conflict/error states.
- Add route/component tests for loading, empty, filtered, and mutation states.

### Phase 4: Edit and meeting integration

- Make the meeting editor’s Membership & Ordinances section visually distinct from Ward & Stake Business and Callings.
- Add a clear link from each meeting action section to the workspace.
- Preserve action IDs and history during edits.
- Keep private preparation fields out of print/public rendering.

### Phase 5: Dashboard and notifications

- Replace dashboard links to `/meetings` with `/membership-ordinances` for action queues.
- Add counts for needs attention, overdue, interview follow-up, and LCR follow-up.
- Keep notification events tied to meaningful transitions, not autosave or page views.

### Phase 6: Offline and conflict handling

- Include the latest authorized action data in the existing At-the-Stand offline snapshot only where needed for conducting.
- Keep workspace planning and destructive edits online-first until conflict handling is proven.
- Route supported status mutations through the existing conflict/idempotency contract before enabling offline writes.

## Acceptance criteria

- Authorized users can open `/membership-ordinances` from navigation.
- Records are ward-scoped and unavailable to users without meeting-management access.
- The workspace distinguishes membership actions and priesthood actions without presenting them as callings.
- Each row links to the meeting where the action is attached.
- Completed actions remain visible in history but do not appear in the needs-attention queue unless LCR follow-up remains needed.
- Public, print, and published program surfaces expose none of the workspace’s private follow-up metadata.
- Existing meeting and At-the-Stand behavior continues to pass its tests.

## Verification sequence

From `/root/workspaces/the-stand`:

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test
npm run typecheck
npm run build
git diff --check
```
