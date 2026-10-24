# Dashboard and Navigation Personalization Plan

## Goal

Keep The Stand's primary navigation predictable while allowing each authorized user to arrange the dashboard around their own ward responsibilities.

## Product decision

### Sidebar

- Keep one canonical, role- and module-filtered order in `src/auth/navigation.ts`.
- Do not persist per-user sidebar ordering in this milestone.
- Preserve the same order in desktop, mobile, and conducting/focus navigation.
- Future enhancement: collapsible navigation groups, without arbitrary item ordering.

### Dashboard

- Keep a canonical default card order in the dashboard code.
- Allow a user to reorder visible cards for the active ward.
- Store the preference per `(user_id, ward_id)`.
- Only card IDs from the current server-defined catalog may be persisted.
- Cards hidden by permissions or disabled modules are never rendered, regardless of saved order.
- Reset restores the canonical order and removes the user override.
- Provide accessible Move up / Move down ordering plus pointer drag-and-drop.

## Data contract

Table: `dashboard_layout_preference`

- `id uuid primary key`
- `ward_id uuid not null references ward(id) on delete cascade`
- `user_id uuid not null references user_account(id) on delete cascade`
- `card_order jsonb not null default '[]'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique `(ward_id, user_id)`
- RLS enabled and forced; users may read/write only their active ward and own row.

The API validates that `card_order` is an array of unique known card IDs. Unknown, duplicate, or non-string IDs return `400`.

## API

`/api/w/[wardId]/dashboard-preferences`

- `GET`: authenticated user with meeting visibility in the active ward; returns `{ cardOrder: string[] }`, using the canonical default when no row exists.
- `PATCH`: same authorization; validates and upserts `{ cardOrder: string[] }`.
- `DELETE`: same authorization; removes the row and returns the canonical default.

Authorization and ward context are enforced server-side and by PostgreSQL RLS. The route never accepts a different ward than the authenticated active ward.

## UI

- Server page computes the visible card catalog and default order.
- Client dashboard grid loads the saved order after hydration.
- While loading, canonical order remains visible.
- `Edit dashboard` enters ordering mode.
- Each card exposes accessible Move up / Move down controls in ordering mode.
- Save changes after each move through the API; failures show a recoverable status and retain the local order.
- `Reset dashboard` deletes the preference and restores canonical order.
- Navigation remains canonical and shared between desktop/mobile/focus modes.

## Files

### Create

- `apps/web/drizzle/0008_dashboard_layout_preference.sql`
- `apps/web/app/api/w/[wardId]/dashboard-preferences/route.ts`
- `apps/web/app/api/w/[wardId]/dashboard-preferences/route.vitest.ts`
- `apps/web/components/dashboard/dashboard-grid.tsx`
- `apps/web/components/dashboard/dashboard-grid.vitest.tsx`
- `apps/web/src/db/dashboard-layout-rls.vitest.ts`

### Modify

- `apps/web/src/db/schema.ts`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/messages/en-US.json`
- `apps/web/messages/en-XA.json`
- `apps/web/src/db/*` focused RLS/schema tests as needed
- generated `docs/DEPENDENCY_GRAPH.md`

## Completed milestone: collapsible canonical navigation groups

- Keep item order and authorization server-derived from `getNavigationItems`.
- Assign visible links to fixed groups: Workspace, Ward Operations, People and Ministry, and Administration. Authorized Support destinations are grouped under Administration.
- Allow each user to collapse or expand groups locally, scoped by user and active ward.
- Keep the active route visible by forcing its group open.
- Use the same grouped navigation component in desktop, mobile, and focus mode.
- Do not persist item ordering or allow users to create, rename, or reorder groups.

### Completed milestone acceptance criteria

1. Group construction preserves the existing canonical item order and module/role filtering.
2. Empty groups are omitted.
3. Group controls expose `aria-expanded` and `aria-controls` and work by keyboard.
4. Collapse preferences do not cross users or wards.
5. Active routes remain visible even when a stored group preference is collapsed.
6. Focus mode and mobile use the same grouped navigation model.

## Completed milestone: dashboard layout polish

- Keep drag-and-drop and accessible move controls as equivalent ordering paths.
- Add a visible drop-target state and preserve the current order when persistence fails.
- Verify touch/mobile behavior and reduced-motion styling before adding any drag library.
- Do not add arbitrary widgets, user-created groups, or user-controlled authorization.

## Completed milestone: responsive dashboard acceptance

- Exercise the authenticated dashboard at desktop and mobile widths.
- Verify drag feedback, move buttons, reset, and failed-save behavior in the browser.
- Keep touch devices on the move-button fallback unless native drag support is confirmed.
- Do not add a drag library until browser evidence shows a real touch requirement.

## Follow-up

- Programs navigation milestone: rename the former Program Studio group to Programs; show a Program Studio landing link, Baptism Programs only for authorized program roles, Template Gallery only when the advanced designer feature is enabled, and template administration only to its existing admin roles. Group membership remains a projection of module/role-authorized links; program items remain content inside each program, not sidebar links. The landing page must distinguish sacrament programs and baptism programs without exposing a route that the current role cannot use. Verify desktop/mobile navigation, direct page authorization, localization, and full gates before release.
- Collect user feedback before expanding dashboard personalization beyond ordering and collapse state.
- Keep permissions, module enablement, and card contents server-defined.

## Non-goals

- Per-user sidebar ordering.
- Ward-wide dashboard layouts.
- Arbitrary user-created widgets.
- Changing module enablement or authorization from the dashboard.

## Completed milestone: attention-focused dashboard and compact meeting editor

### Dashboard

- Keep the next-meeting card visible outside the reorderable secondary-card area, regardless of saved card order.
- Keep **At the Stand** the primary action on that card; retain edit and print actions.
- Consolidate the six membership/ordinance follow-up panels into one compact summary with all six counts and the same filtered-queue destinations.
- Keep current server-derived role/module visibility and existing per-user/per-ward ordering/reset behavior. Do not change authorization or create new preference data.

### Meeting editor

- Keep the Introduction item and core presiding/conducting/organist/chorister fields open and immediately visible.
- Collapse details for other program items, with a summary that identifies the item and its current public/program-facing value.
- Keep every existing field and workflow reachable, including internal notes, announcements, business, membership actions, drag order, readiness, autosave/conflict resolution, publish, and delete.
- Use native keyboard-accessible disclosure semantics and verify a narrow viewport.

### Non-goals in this milestone

- Program Studio defaults or layout controls.
- Calling lifecycle presentation.
- Sidebar/account-menu redesign.
- Permission, module, API, database, or public-output behavior changes.

### Acceptance criteria

1. The next meeting and **At the Stand** action remain visible independent of saved dashboard card order; At the Stand remains primary.
2. All six membership follow-up counts and their existing query-string destinations remain available in one summary card; it is absent when the module/role gate hides membership work.
3. Secondary dashboard cards remain reorderable, resettable, and preference-scoped as before.
4. Introduction and core leadership fields remain visible on initial meeting-form render; other item details can be opened and closed with keyboard and pointer.
5. Collapsed item summaries do not display internal notes or private-only fields.
6. All existing form capabilities and role/module checks are unchanged.
7. Focused component tests, full tests (including configured PostgreSQL/RLS), typecheck, lint, build, i18n validation, dependency graph, diff check, and responsive browser acceptance pass.

## Verification

1. Focused component tests for dashboard priority/grouped queues and meeting-item disclosures.
2. Full unit/component suite plus serialized live PostgreSQL/RLS suite through `npm test`.
3. Typecheck, lint, production build, i18n validation, dependency graph generation/check, and `git diff --check`.
4. Browser acceptance for desktop/mobile and keyboard interaction.
5. Exact-tree review after the final patch.

## Completed milestone: Program Studio and workflow-shell hierarchy

### Scope

Continue reducing routine visual scanning while preserving every authorized destination and editor capability:

- Open the meeting program editor in its content-editing mode, while retaining layout editing, digital, mobile, and print modes as explicit accessible choices.
- Make the next valid calling-lifecycle transition the most prominent row action; keep assignment, release, and delete actions available in a per-row secondary disclosure with unchanged visibility and confirmation behavior.
- Remove the singleton Support navigation heading by placing its already-authorized destination in Administration; keep canonical link order and all role/module/page/API guards unchanged.

### Acceptance criteria

1. A fresh Program Designer load selects Content and displays program entries; the user can still enter Edit and all preview modes without losing draft state.
2. Existing layout customization remains collapsed by default and is available only under its current feature/ward capability gates.
3. Calling rows expose the next safe lifecycle action prominently; secondary actions remain present for precisely the same statuses and permissions, with keyboard operation and row-local confirmation.
4. Support remains visible only to currently authorized users, appears under Administration, and direct-route behavior is unchanged.
5. No route, action, role/module condition, persistence behavior, or responsive/keyboard access is removed.
6. Focused tests, full unit/component and live PostgreSQL/RLS tests, typecheck, lint, build, i18n validation, dependency graph, browser acceptance, diff check, and exact-tree review pass.

### Verification

1. Program Designer component tests for the default mode, editor visibility, mode switching, and collapsed customization.
2. Calling action tests for primary/secondary action mapping, status and permission visibility, and keyboard activation.
3. Navigation projection tests for canonical order, grouping, role/module filtering, and empty groups.
4. Browser acceptance for authenticated destinations, calling action disclosure, Program Designer default mode, and responsive shell behavior.
5. Run all repository release gates and obtain a fresh exact-tree review after the last edit.

### Verification recorded

- `npm run test --workspace @the-stand/web`: 1,008 unit/component tests passed; configured migration and live PostgreSQL/RLS suites passed.
- `npm run typecheck --workspace @the-stand/web`, `npm run lint --workspace @the-stand/web`, `npm run i18n:validate`, and dependency-graph generation/check passed.
- Production build completed successfully.
- Browser acceptance for `acceptance.spec.ts` and `responsive-dashboard.spec.ts`: 15 passed; the visual-audit-only calling workflow test is skipped in the default fixture and was run separately with `E2E_VISUAL_AUDIT=1`.
- Exact-tree review and `git diff --check` are required after the final test-only assertion update.
