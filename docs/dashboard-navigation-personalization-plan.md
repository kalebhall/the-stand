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
- Assign visible links to fixed groups: Workspace, Ward Operations, People and Ministry, Administration, and Support.
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

- Collect user feedback before expanding dashboard personalization beyond ordering and collapse state.
- Keep permissions, module enablement, and card contents server-defined.

## Non-goals

- Per-user sidebar ordering.
- Ward-wide dashboard layouts.
- Arbitrary user-created widgets.
- Changing module enablement or authorization from the dashboard.

## Verification

1. Focused API validation/auth tests.
2. Dashboard ordering component tests: default order, move controls, reset, failed save.
3. Live migration/RLS test for `(ward_id, user_id)` isolation.
4. Full unit/component suite plus serialized live PostgreSQL/RLS suite through `npm test`.
5. Typecheck, lint, production build, dependency graph check, and `git diff --check`.
6. Exact-tree review after the final patch.
