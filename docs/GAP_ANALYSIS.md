# GAP_ANALYSIS.md — The Stand Codebase Audit

**Audit date**: 2026-02-14
**Auditor**: Claude Opus 4.6 (automated codebase audit)
**Scope**: All 14 phases (0-13) from PLANS.md, plus UI-to-API wiring, RLS verification, audit logging, and cross-cutting concerns.

---

## Phase 0 — Repository Foundation

- **Status**: Complete
- **Working**:
  - Next.js 15 App Router scaffolded at `apps/web/`
  - Tailwind CSS 4 configured (`app/globals.css`, `tailwind.config.ts`)
  - shadcn/ui installed (`components.json`, `components/ui/` with button)
  - ESLint 9 flat config (`eslint.config.js` at root + web)
  - Vitest configured (`vitest.config.ts` at shared package)
  - CI workflow at `.github/workflows/ci.yml` (lint, typecheck, test, build)
  - CodeQL workflow at `.github/workflows/codeql.yml`
  - `.env.example` present
  - All docs files present (AGENTS.md, ARCHITECTURE.md, SCHEMA.md, API.md, UI.md, PERMISSIONS.md, ACCEPTANCE.md, plus extras PLANS.md, SRS.md, INSTALL.md, HARDENING.md, RELEASE_NOTES.md, CODEX_KICKOFF.md)
  - `npm run build` and `npm run test` pass
  - npm workspaces monorepo (root + apps/web + packages/shared)
- **Incomplete/Broken**:
  - `npm run test` is a **placeholder** — `scripts/vitest.mjs` only checks file existence (health route contains `status: 'ok'`, key page files exist). It does NOT run Vitest unit tests.
  - `npm run build` is a **placeholder** — `scripts/next-build.mjs` only checks that required files exist. It does NOT run `next build`.
  - Prettier is NOT configured (no `.prettierrc`, no prettier dependency in package.json). PLANS.md specifies "Configure ESLint + Prettier."
- **Missing**:
  - Real `next build` integration in CI (currently a file-existence check)
  - Real Vitest test execution from root (the shared package has vitest config but the root script doesn't invoke it)
  - Prettier configuration
- **Files affected**: `scripts/vitest.mjs`, `scripts/next-build.mjs`, `package.json`

---

## Phase 1 — Database & RLS Foundation

- **Status**: Partial
- **Working**:
  - Drizzle ORM installed with `drizzle.config.ts`
  - 9 migration files covering all phases (0000-0008)
  - Base tables created in `0000_init.sql`: `stake`, `ward`, `user_account`, `role`, `user_global_role`, `ward_user_role`, `audit_log`
  - RLS enabled on ward-scoped tables in `0000_init.sql`: `ward_user_role`, `audit_log`
  - RLS policies reference `current_setting('app.ward_id', true)`
  - DB context setter implemented in `src/db/context.ts` using `set_config('app.ward_id', ...)` and `set_config('app.user_id', ...)`
  - All ward-scoped API routes call `setDbContext()` before queries
  - Schema file at `src/db/schema.ts` defines all tables from all phases
- **Incomplete/Broken**:
  - RLS is only enabled on a **subset** of ward tables. In `0000_init.sql`, only `ward_user_role` and `audit_log` get `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and policies. However, later migrations (0001-0008) do NOT add RLS to their new ward-scoped tables (`meeting`, `meeting_program_item`, `meeting_program_render`, `meeting_business_line`, `calling_assignment`, `calling_action`, `announcement`, `event_outbox`, `notification_delivery`, `public_program_share`, `public_program_portal`, `calendar_feed`, `calendar_event_cache`, `member`, `member_note`, `import_run`, `ward_stand_template`). **Most ward-scoped tables lack RLS policies.**
  - The code compensates by always including `WHERE ward_id = $1` in queries AND setting DB context, but PostgreSQL-level RLS is NOT actually enforcing isolation on most tables.
  - No automated test proving cross-ward query fails at DB level (the E2E test `acceptance.spec.ts` tests cross-ward API access returning 403, but does not test raw SQL RLS).
- **Missing**:
  - RLS policies on 17+ ward-scoped tables added in migrations 0001-0008
  - DB-level cross-ward isolation test (unit test proving `SELECT` without matching ward_id returns no rows when RLS is active)
- **Files affected**: `apps/web/drizzle/0001_phase5_meetings.sql` through `0008_phase10_membership_import.sql`, `apps/web/src/db/context.ts`

---

## Phase 2 — Authentication & Bootstrap

- **Status**: Complete
- **Working**:
  - Auth.js (NextAuth 5) with Google OAuth provider (`src/auth/auth.ts`)
  - Credentials provider with email/password login
  - Argon2id hashing (`src/auth/password.ts`) with recommended params (memoryCost=65536, timeCost=3, parallelism=1)
  - Bootstrap logic in `src/db/bootstrap-support-admin.ts`:
    - Generates random password via `crypto.randomBytes(24).toString('base64url')` (32+ chars)
    - Prints once to console logs
    - Sets `must_change_password = true`
    - Creates SUPPORT_ADMIN role and assigns to bootstrap user
    - Audit log entry for `SUPPORT_ADMIN_BOOTSTRAPPED`
  - Bootstrap triggered on every credentials login and Google sign-in (`ensureSupportAdminBootstrap()`)
  - Forced change-password flow: `enforcePasswordRotation()` in `src/auth/guards.ts` redirects to `/account/change-password`
  - Rate limiting on credentials login: `enforceRateLimit('auth:credentials:...',  10)` — 10 attempts per 10 min per email+IP
  - `/api/me` endpoint returns session user data
  - `/api/account/change-password` endpoint with rate limiting and audit logging
  - Change-password page at `/account/change-password/page.tsx`
- **Incomplete/Broken**:
  - Rate limiting is **in-memory only** (`src/lib/rate-limit.ts` uses a `Map`). This resets on server restart and doesn't work across multiple server instances.
  - The login form at `/login/login-form.tsx` uses `signIn('credentials', ...)` from next-auth/react correctly, but the password field has `PASSWORD_AUTH_ENABLED` env check — if not set, password login is hidden but still functional at the API level.
- **Missing**:
  - Persistent rate limiting (Redis-backed or DB-backed) — currently in-memory only
- **Files affected**: `src/auth/auth.ts`, `src/auth/password.ts`, `src/auth/guards.ts`, `src/db/bootstrap-support-admin.ts`, `src/lib/rate-limit.ts`, `app/api/me/route.ts`, `app/api/account/change-password/route.ts`

---

## Phase 3 — Role & Permission Model

- **Status**: Complete
- **Working**:
  - Role definitions: `GLOBAL_ROLES` (SUPPORT_ADMIN, SYSTEM_ADMIN) and `WARD_ROLES` (STAND_ADMIN, BISHOPRIC_EDITOR, CLERK_EDITOR, WARD_CLERK, MEMBERSHIP_CLERK, CONDUCTOR_VIEW) in `src/auth/roles.ts`
  - Permission helpers: `hasRole()`, `canManageWardUsers()`, `canAssignRole()`, `canViewMeetings()`, `canManageMeetings()`, `canViewCallings()`, `canManageCallings()` — all ward-scoped
  - All ward API routes protected with auth + permission checks
  - Ward Admin user management UI at `/settings/users/` with `WardUsersManager` client component
  - STAND_ADMIN assignment restricted to SUPPORT_ADMIN only (`canAssignRole`)
  - Support Admin console at `/support/` with sub-pages:
    - `/support/provisioning` — stake/ward CRUD with full audit logging
    - `/support/users` — user CRUD, activation toggle, ward role assign/revoke with full audit logging
    - `/support/access-requests` — access request triage with audit logging
  - All admin/support actions audited (34 files contain audit_log inserts, covering 60+ insert statements)
- **Incomplete/Broken**:
  - No `requirePermission` helper exists (PLANS.md mentions `requireRole/requirePermission`). Permission checks are done via individual functions like `canManageMeetings()` rather than a generic middleware. This is functionally equivalent but doesn't match the spec name.
  - Ward Admin cannot manage global roles through the settings UI (by design — STAND_ADMIN is restricted to SUPPORT_ADMIN). But the settings/users page uses `hasRole(session.user.roles, 'STAND_ADMIN')` which means only STAND_ADMIN can access ward user management, not just any "Ward Admin."
- **Missing**:
  - Generic `requirePermission()` middleware wrapper (minor — the individual helpers cover all cases)
- **Files affected**: `src/auth/roles.ts`, `src/auth/guards.ts`, `app/settings/users/`, `app/support/`

---

## Phase 4 — Dashboard & Core UI

- **Status**: Complete
- **Working**:
  - `/dashboard` route with role-aware cards:
    - Next meeting (hardcoded "No meetings scheduled" — see Incomplete)
    - Draft count (hardcoded "0 drafts" — see Incomplete)
    - Set apart queue count (live DB query)
    - Notification health (live DB query — last delivery, failure count)
    - Last import summary (hardcoded "Pending phase 10")
    - Public portal status (hardcoded "Pending phase 8", shown only for STAND_ADMIN/SUPPORT_ADMIN/SYSTEM_ADMIN)
    - Support cards (user admin + provisioning) shown only for SUPPORT_ADMIN
  - Landing page at `/` with app description and login/request-access links
  - Request access flow at `/request-access/` with form (name, email, stake, ward, message) and honeypot field (`website`) for bot detection
  - Public access-request API at `/api/public/access-requests` with rate limiting
  - Logout page at `/logout/`
  - Login → dashboard redirect works via NextAuth `callbackUrl` and session redirect in login page
- **Incomplete/Broken**:
  - **Next meeting card**: Always shows "No meetings scheduled" with static text. Does NOT query the database for the next upcoming meeting. No Edit/Stand/Print quick-action links with real meeting IDs.
  - **Draft count card**: Always shows "0 drafts" with static text. Does NOT query meeting count where status='DRAFT'.
  - **Import summary card**: Hardcoded "Pending phase 10" even though Phase 10 (imports) IS implemented.
  - **Public portal card**: Hardcoded "Pending phase 8" even though Phase 8 (public portal) IS implemented.
  - **No `/api/w/{wardId}/dashboard` API route** — the dashboard fetches data directly via server component (RSC pattern). This is valid architecture but means no dedicated dashboard API endpoint exists per API.md.
  - No `loading.tsx` files anywhere in the app — pages have no loading states during server component data fetches.
  - No `error.tsx` files anywhere in the app — unhandled errors will show Next.js default error page.
- **Missing**:
  - Live "next meeting" card with actual meeting data and Edit/Stand/Print links
  - Live "draft count" card querying real data
  - Live "import summary" card showing last import result
  - Live "public portal status" card showing portal token status
  - `GET /api/w/{wardId}/dashboard` endpoint (documented in API.md but not implemented — dashboard uses RSC instead)
  - Loading states (`loading.tsx`) for all pages
  - Error boundaries (`error.tsx`) for all pages
- **Files affected**: `app/dashboard/page.tsx`, `app/page.tsx`, `app/request-access/`, `app/logout/page.tsx`

---

## Phase 5 — Meetings MVP

- **Status**: Complete
- **Working**:
  - Meeting CRUD:
    - `POST /api/w/{wardId}/meetings` — create meeting (with audit log)
    - `GET /api/w/{wardId}/meetings` — list meetings
    - `GET /api/w/{wardId}/meetings/{meetingId}` — get single meeting
    - `PUT /api/w/{wardId}/meetings/{meetingId}` — update meeting (with audit log)
    - `DELETE /api/w/{wardId}/meetings/{meetingId}` — delete meeting (with audit log)
  - Hymns: `hymn_number` + `hymn_title` fields on `meeting_program_item`
  - Ordered program items with `sequence` column, drag reorder UI (move up/down buttons)
  - Publish action at `POST /api/w/{wardId}/meetings/{meetingId}/publish`:
    - Creates immutable `meeting_program_render` with `render_html` and incremented `version`
    - Sets meeting status to 'PUBLISHED'
    - Audit log: `MEETING_PUBLISHED` or `MEETING_REPUBLISHED`
  - Republish versioning: version number increments, all versions preserved and viewable
  - Printable view at `/meetings/{meetingId}/print` with published snapshot rendering
  - Meeting completion at `POST /api/w/{wardId}/meetings/{meetingId}/complete` with audit log
  - Meeting form supports create and edit modes with program item management
  - Meeting types: SACRAMENT, FAST_TESTIMONY, WARD_CONFERENCE, STAKE_CONFERENCE, GENERAL_CONFERENCE
  - Render includes announcements (top/bottom placement), sacrament prayers, and proper HTML escaping
- **Incomplete/Broken**:
  - Meeting list page (`/meetings/page.tsx`) uses RSC with direct DB queries — works correctly but has no pagination for large meeting lists.
  - Print view uses `dangerouslySetInnerHTML` for the published snapshot. The HTML is server-generated with proper escaping, but the pattern is worth noting.
- **Missing**:
  - Pagination on meetings list
- **Files affected**: `app/meetings/`, `app/api/w/[wardId]/meetings/`, `src/meetings/`

---

## Phase 6 — At the Stand View

- **Status**: Complete
- **Working**:
  - `/stand/{meetingId}` route with full implementation
  - Formal Script mode (default): large text cards with welcome text, standard items, and sustain/release phrasing with bold segments
  - Compact Labels mode (`?mode=compact`): smaller text with label/value pairs
  - Bold name + calling in sustain/release: `parseBoldSegments()` parses `**text**` into bold segments for React rendering
  - Visitor-friendly welcome text from `ward_stand_template` table (customizable per ward)
  - Template overrides: sustain/release phrasing customizable via `/settings/stand-script` page
  - Mode toggle via URL query param with styled tab buttons
  - Migration `0002_phase6_stand_view.sql` creates `ward_stand_template` table
- **Incomplete/Broken**:
  - Stand view does NOT include business lines (sustain/release items from `meeting_business_line` table). It only renders `meeting_program_item` entries. If sustain/release items exist as program items, they render; but the auto-generated business lines from Phase 7 are not pulled into the stand view.
- **Missing**:
  - Integration with `meeting_business_line` table for auto-generated sustain/release entries
- **Files affected**: `app/stand/[meetingId]/page.tsx`, `src/stand/render.ts`, `app/settings/stand-script/page.tsx`

---

## Phase 7 — Callings Workflow

- **Status**: Partial
- **Working**:
  - `calling_assignment` and `calling_action` tables created in `0003_phase7_callings.sql`
  - `meeting_business_line` table created in same migration
  - Callings API: propose, extend, sustain, set-apart lifecycle actions with full audit logging
  - Set Apart Queue: `/callings` page displays sustained callings awaiting set-apart
  - Callings list page shows all assignments with latest status
  - Event outbox integration: callings API routes write `event_outbox` entries for notifications (created in `0004_phase7_notifications.sql`)
  - Audit logging for all calling lifecycle transitions: `CALLING_PROPOSED`, `CALLING_EXTENDED`, `CALLING_SUSTAINED`, `CALLING_SET_APART`
- **Incomplete/Broken**:
  - **Auto-add sustain/release business lines**: The `meeting_business_line` table exists, but there is **no code** that automatically adds sustain/release business lines to a meeting when a calling is sustained or released. The table schema is there but the business logic to auto-populate it is missing.
  - **Notifications to bishopric and clerks**: Event outbox entries are created, but the actual notification content/templates for "notify bishopric" and "notify clerks" are not defined. The webhook just sends raw event data.
  - **LCR instruction in notifications**: No explicit LCR instruction template exists in the notification payloads.
  - The callings page is read-only — there is no UI to propose, extend, sustain, or set-apart callings from the callings page. These actions are API-only (no buttons in the UI).
- **Missing**:
  - Auto-add sustain/release business lines to meetings when callings transition
  - UI actions on callings page (propose/extend/sustain/set-apart buttons)
  - LCR instruction templates in notification payloads
  - Calling lifecycle management UI (currently API-only via direct API calls or import system)
- **Files affected**: `app/callings/page.tsx`, `app/api/w/[wardId]/callings/`, `src/callings/` (no service file exists), `drizzle/0003_phase7_callings.sql`

---

## Phase 8 — Public Program Portal

- **Status**: Complete
- **Working**:
  - `/p/{meetingToken}` route returns published snapshot HTML
  - `/p/ward/{portalToken}` route returns most recent published meeting for ward
  - `public_program_share` and `public_program_portal` tables created in `0005_phase8_public_portal.sql`
  - Only published snapshots render (queries join on `m.status = 'PUBLISHED'`)
  - No internal data exposed (returns only `render_html`)
  - Token-based access without authentication
  - Proper error handling (404 for invalid tokens)
- **Incomplete/Broken**:
  - **Token rotation** is NOT implemented. The `public_program_portal` table has a `token` column but there is no API endpoint or UI to rotate/regenerate tokens. Once created, tokens are permanent.
  - **No management UI** for public portal tokens. The navigation references `/settings/public-portal` but **this page does not exist** (confirmed: no files under `apps/web/app/settings/public-portal/`).
  - **No API endpoints** for creating/managing `public_program_share` or `public_program_portal` records. There is no way to create share tokens through the app — they would need to be inserted directly into the database.
  - Dashboard "Public portal status" card is hardcoded to "Pending phase 8" despite the public routes being implemented.
- **Missing**:
  - `/settings/public-portal` page for portal token management
  - API endpoints for CRUD on `public_program_share` and `public_program_portal`
  - Token rotation functionality
  - Dashboard integration showing portal status
- **Files affected**: `app/p/[meetingToken]/route.ts`, `app/p/ward/[portalToken]/route.ts`, `app/settings/public-portal/` (missing)

---

## Phase 9 — Announcements & Calendar

- **Status**: Complete
- **Working**:
  - `calendar_feed` and `calendar_event_cache` tables created in `0007_phase9_calendar.sql`
  - `announcement` table created in `0006_phase9_announcements.sql`
  - ICS refresh: login-triggered (in `signIn` callback) and manual (via "Refresh calendar feeds" button on announcements page)
  - ICS parser at `src/calendar/ics.ts` handles VEVENT parsing, date formats, line unfolding, categories/tags
  - Cache pruning: `pruneCalendarEventCache()` deletes events older than 7 days during refresh
  - Copy-to-announcement feature via tag map rules (`resolveTagRule` in `src/calendar/service.ts`)
  - Permanent announcement flag with `is_permanent` boolean
  - Announcement placement (PROGRAM_TOP / PROGRAM_BOTTOM)
  - Date-window announcements with start/end dates
  - Active/upcoming/expired categorization on announcements page
  - Announcements integrated into meeting render output (top and bottom placement)
  - Audit logging for: `ANNOUNCEMENT_CREATED`, `ANNOUNCEMENT_DELETED`, `CALENDAR_REFRESH_MANUAL`, `CALENDAR_EVENT_COPIED_TO_ANNOUNCEMENT`
  - Announcement CRUD via both server actions (on page) and API routes
- **Incomplete/Broken**:
  - Calendar feed management: No UI to create/edit/delete calendar feeds. Feeds must be inserted directly into the database. The announcements page shows existing feeds and their refresh status but cannot configure new ones.
  - Announcement update: The API route `PUT /api/w/{wardId}/announcements/{announcementId}` exists for updating announcements, but the announcements page UI only has create and delete — no edit form.
- **Missing**:
  - Calendar feed CRUD UI (add/edit/remove feeds)
  - Announcement edit UI (only create and delete exist on the page)
- **Files affected**: `app/announcements/page.tsx`, `app/api/w/[wardId]/announcements/`, `src/calendar/service.ts`, `src/calendar/ics.ts`

---

## Phase 10 — Import System

- **Status**: Complete
- **Working**:
  - Plain-text paste input enforced (textarea input, `toPlainText()` strips HTML before parsing)
  - Membership format parser: CSV-like parsing (Name, Email, Phone per line) at `POST /api/w/{wardId}/imports/membership`
  - Callings format parser at `src/imports/callings.ts`: handles tab/pipe/comma/dash separators, "Release:" prefix, "as" keyword, deduplication
  - Dry-run preview: `commit=false` returns parsed preview without DB changes
  - Conflict resolution: membership import uses `ON CONFLICT (ward_id, LOWER(full_name))` for upsert; callings import checks existing active assignments
  - Commit stage: `commit=true` writes to DB, creates `import_run` record, audit log entries
  - Calling drift indicator: shows sync status between current active callings and latest committed import
  - Member notes: restricted notes with per-member tracking and attribution
  - `member`, `member_note`, `import_run` tables created in `0008_phase10_membership_import.sql`
  - Import UI at `/imports/` with membership import, calling import, and member notes sections
  - Dashboard "Import summary" card is hardcoded but imports work end-to-end
- **Incomplete/Broken**:
  - **Raw paste purge**: The `import_run` table stores `raw_text` but there is NO scheduled job or mechanism to purge raw paste data after a retention window. PLANS.md requires "Purge raw paste after retention window."
  - Dashboard import summary card shows "Pending phase 10" despite full implementation
- **Missing**:
  - Raw paste purge job (scheduled cleanup of `import_run.raw_text` after retention period)
  - Dashboard integration for import summary card
- **Files affected**: `app/imports/`, `app/api/w/[wardId]/imports/`, `src/imports/callings.ts`, `drizzle/0008_phase10_membership_import.sql`

---

## Phase 11 — Notifications & Outbox

- **Status**: Complete
- **Working**:
  - `event_outbox` table with status lifecycle (pending → processing → processed) in `0004_phase7_notifications.sql`
  - `notification_delivery` table with delivery tracking
  - Dedupe constraint: `ON CONFLICT (event_outbox_id, channel)` on notification_delivery
  - BullMQ worker at `src/notifications/worker-entry.ts` with Redis connection
  - Queue management at `src/notifications/queue.ts` with job dedup (`jobId: wardId:eventOutboxId`)
  - Webhook integration at `src/notifications/runner.ts`:
    - POST to `NOTIFICATION_WEBHOOK_URL` with idempotency-key header
    - Retry with exponential backoff (5s base, max 300s)
    - Success/failure tracking
    - External ID capture from `x-delivery-id` header
  - Diagnostics UI at `/notifications/` showing recent deliveries, failure count, and details table
  - Diagnostics API at `GET /api/w/{wardId}/notifications/diagnostics`
  - Infrastructure: systemd service for worker (`infra/systemd/the-stand-worker.service`)
- **Incomplete/Broken**:
  - **No SMTP integration** — webhook only. PLANS.md lists "Optional SMTP integration" so this is acceptable.
  - Outbox events are created in calling lifecycle routes but NOT in meeting publish/complete routes. Meeting events don't trigger notifications.
- **Missing**:
  - SMTP integration (optional per PLANS.md)
  - Outbox event creation in meeting lifecycle (publish, complete)
- **Files affected**: `src/notifications/`, `app/notifications/page.tsx`, `drizzle/0004_phase7_notifications.sql`

---

## Phase 12 — Hardening & Validation

- **Status**: Partial
- **Working**:
  - `/health` endpoint returns `{ status: 'ok', db: 'connected' }` with DB connectivity check
  - `/api/health` also exists (duplicate health check)
  - Nginx config at `infra/nginx/the-stand.conf`
  - Systemd services at `infra/systemd/the-stand.service` and `the-stand-worker.service`
  - Backup/restore scripts at `infra/scripts/backup.sh` and `infra/scripts/restore.sh`
  - Rate limiting on credentials login (10 attempts/10min), change-password, and public access-requests
  - Audit logging comprehensive (60+ inserts across 34 files)
  - Production readiness Vitest file at `src/hardening/production-readiness.vitest.ts` checking:
    - No secrets in console.log
    - Rate limiting on required endpoints
    - ACCEPTANCE.md document present
- **Incomplete/Broken**:
  - **RLS NOT enabled on most ward tables** (see Phase 1 — only `ward_user_role` and `audit_log` have RLS policies; 17+ other ward-scoped tables lack them)
  - **Production readiness tests reference files that don't exist**: `production-readiness.vitest.ts` tries to read `apps/web/server.mjs` and `apps/web/src/bootstrap.mjs` — these files don't exist and the test would fail if actually run.
  - **No CSP (Content Security Policy)** implementation — `src/hardening/csp.ts` does not exist. HARDENING.md specifies CSP headers.
  - **Rate limiting is in-memory** — will not survive restarts or work across instances
  - **PostgreSQL local-only**: Not verifiable from code (infrastructure config concern)
  - **Restore test**: script exists but no evidence of actual test execution
- **Missing**:
  - RLS policies on 17+ ward-scoped tables
  - CSP header implementation
  - Persistent rate limiting (Redis or DB-backed)
  - `server.mjs` and `src/bootstrap.mjs` files (referenced by hardening tests)
  - Actual restore test documentation/evidence
- **Files affected**: `app/health/route.ts`, `src/hardening/`, `src/lib/rate-limit.ts`, `infra/`, all migration files

---

## Phase 13 — Release Candidate

- **Status**: Partial
- **Working**:
  - Version defined: `APP_VERSION = '0.1.0'` in `src/lib/version.ts`
  - Release notes document at `docs/RELEASE_NOTES.md`
  - E2E acceptance test at `apps/web/e2e/acceptance.spec.ts` covering:
    - Bootstrap admin forced password change
    - Ward isolation (cross-ward API 403)
    - Meeting create/publish/print flow
    - Stand view formal/compact modes
    - Public portal access
  - Deployment documentation at `docs/INSTALL.md`
  - Schema documented at `docs/SCHEMA.md`
- **Incomplete/Broken**:
  - **Version is 0.1.0**, not v1.0.0 as specified in PLANS.md
  - **Schema not frozen** — no migration freeze mechanism
  - **E2E tests assume seeded data** (ward IDs `11111111-...`, meeting IDs `33333333-...`) — these would fail without a test database seed
  - **No actual regression test run** documented
  - **Bootstrap path not re-verified** in release (only tested in E2E which isn't runnable without DB)
- **Missing**:
  - v1.0.0 version tag
  - Schema freeze mechanism
  - E2E test database seed script
  - Full regression test execution evidence
  - Clean deploy verification on fresh Ubuntu VM
- **Files affected**: `src/lib/version.ts`, `docs/RELEASE_NOTES.md`, `e2e/acceptance.spec.ts`

---

## Cross-Cutting Audit: RLS Verification

### Tables WITH RLS enabled (from `0000_init.sql`):
| Table | RLS Enabled | Policy |
|-------|-------------|--------|
| `ward_user_role` | Yes | `ward_user_role_ward_isolation` — `ward_id = current_setting('app.ward_id', true)::uuid` |
| `audit_log` | Yes | `audit_log_ward_isolation` — `ward_id IS NULL OR ward_id = current_setting('app.ward_id', true)::uuid` |

### Tables WITHOUT RLS (ward-scoped, should have RLS per PLANS.md):
| Table | Migration | Status |
|-------|-----------|--------|
| `meeting` | 0001 | No RLS |
| `meeting_program_item` | 0001 | No RLS |
| `meeting_program_render` | 0001 | No RLS |
| `meeting_business_line` | 0003 | No RLS |
| `calling_assignment` | 0003 | No RLS |
| `calling_action` | 0003 | No RLS |
| `event_outbox` | 0004 | No RLS |
| `notification_delivery` | 0004 | No RLS |
| `public_program_share` | 0005 | No RLS |
| `public_program_portal` | 0005 | No RLS |
| `announcement` | 0006 | No RLS |
| `calendar_feed` | 0007 | No RLS |
| `calendar_event_cache` | 0007 | No RLS |
| `member` | 0008 | No RLS |
| `member_note` | 0008 | No RLS |
| `import_run` | 0008 | No RLS |
| `ward_stand_template` | 0002 | No RLS |

**Mitigation**: Application code always includes `WHERE ward_id = $1` and calls `setDbContext()` to set session variables. However, a direct database connection or a bug that omits the WHERE clause could leak data across wards. RLS is defense-in-depth and per PLANS.md is "non-negotiable."

---

## Cross-Cutting Audit: Support Admin Bootstrap Flow

- **Status**: Working end-to-end with one concern
- Bootstrap sequence:
  1. First credentials login triggers `ensureSupportAdminBootstrap()`
  2. Creates `SUPPORT_ADMIN` role if missing
  3. Checks if any user has SUPPORT_ADMIN role
  4. If none: generates random password (32+ chars base64url), creates user account with `must_change_password=true`, assigns role, logs credentials to console
  5. On login, `enforcePasswordRotation()` redirects to `/account/change-password`
  6. After password change, `must_change_password` set to false, redirect to dashboard
- **Concern**: Bootstrap only triggers on credentials login flow (inside `authorize` callback). If the first login is via Google OAuth, bootstrap still triggers in the `signIn` callback. However, the bootstrap creates a credentials-only user, so the SUPPORT_ADMIN must use the credentials login form to initially authenticate.

---

## Cross-Cutting Audit: API Routes vs API.md

| API.md Endpoint | Implemented | Notes |
|----------------|-------------|-------|
| `GET /api/health` | Yes | Returns `{ status: 'ok', db: 'connected' }` |
| `GET /api/me` | Yes | Returns session user data |
| `POST /api/auth/[...nextauth]` | Yes | NextAuth handler |
| `POST /api/account/change-password` | Yes | With rate limiting + audit log |
| `POST /api/public/access-requests` | Yes | With rate limiting + honeypot |
| `GET /api/support/access-requests` | Yes | SUPPORT_ADMIN only |
| `GET /api/w/{wardId}/dashboard` | **No** | Dashboard uses RSC, no API route |
| `GET /api/w/{wardId}/meetings` | Yes | With RBAC |
| `POST /api/w/{wardId}/meetings` | Yes | With RBAC + audit |
| `GET /api/w/{wardId}/meetings/{id}` | Yes | With RBAC |
| `PUT /api/w/{wardId}/meetings/{id}` | Yes | With RBAC + audit |
| `DELETE /api/w/{wardId}/meetings/{id}` | Yes | With RBAC + audit |
| `POST /api/w/{wardId}/meetings/{id}/publish` | Yes | With RBAC + audit |
| `POST /api/w/{wardId}/meetings/{id}/complete` | Yes | With RBAC + audit |
| `GET /api/w/{wardId}/callings` | Yes | With RBAC |
| `POST /api/w/{wardId}/callings` | Yes | With RBAC + audit |
| `POST .../callings/{id}/extend` | Yes | With RBAC + audit |
| `POST .../callings/{id}/sustain` | Yes | With RBAC + audit |
| `POST .../callings/{id}/set-apart` | Yes | With RBAC + audit |
| `GET /api/w/{wardId}/announcements` | Yes | With RBAC |
| `POST /api/w/{wardId}/announcements` | Yes | With RBAC + audit |
| `PUT .../announcements/{id}` | Yes | With RBAC + audit |
| `DELETE .../announcements/{id}` | Yes | With RBAC + audit |
| `GET /api/w/{wardId}/calendar` | Yes | With RBAC |
| `POST /api/w/{wardId}/calendar/refresh` | Yes | With RBAC + audit |
| `POST /api/w/{wardId}/imports/membership` | Yes | With RBAC + audit |
| `POST /api/w/{wardId}/imports/callings` | Yes | With RBAC + audit |
| `GET /api/w/{wardId}/users` | Yes | STAND_ADMIN/SUPPORT_ADMIN |
| `POST .../users/{id}/roles` | Yes | With RBAC + audit |
| `DELETE .../users/{id}/roles/{roleId}` | Yes | With RBAC + audit |
| `GET .../notifications/diagnostics` | Yes | With RBAC |
| `POST .../members/{id}/notes` | Yes | With RBAC + audit |
| `GET /p/{meetingToken}` | Yes | Public, no auth |
| `GET /p/ward/{portalToken}` | Yes | Public, no auth |

**Missing API routes**: `GET /api/w/{wardId}/dashboard` (dashboard uses RSC instead)

---

## Cross-Cutting Audit: UI Routes vs UI.md

| UI.md Route | Implemented | Notes |
|------------|-------------|-------|
| `/` (landing) | Yes | |
| `/login` | Yes | |
| `/logout` | Yes | |
| `/request-access` | Yes | |
| `/dashboard` | Yes | Some cards hardcoded |
| `/meetings` | Yes | |
| `/meetings/new` | Yes | |
| `/meetings/{id}/edit` | Yes | |
| `/meetings/{id}/print` | Yes | |
| `/stand/{meetingId}` | Yes | |
| `/callings` | Yes | Read-only |
| `/announcements` | Yes | |
| `/imports` | Yes | |
| `/notifications` | Yes | |
| `/settings/users` | Yes | |
| `/settings/stand-script` | Yes | |
| `/settings/public-portal` | **No** | Referenced in nav, page missing |
| `/account/change-password` | Yes | |
| `/support` | Yes | |
| `/support/provisioning` | Yes | |
| `/support/users` | Yes | |
| `/support/access-requests` | Yes | |

**Missing UI routes**: `/settings/public-portal`

---

## Cross-Cutting Audit: Audit Log Coverage per PERMISSIONS.md

| Required Action | Audit Logged | Action Name |
|----------------|-------------|-------------|
| Role assignment (ward) | Yes | `WARD_ROLE_ASSIGNED` |
| Role revocation (ward) | Yes | `WARD_ROLE_REVOKED` |
| Ward creation | Yes | `SUPPORT_WARD_CREATED` |
| Stake creation | Yes | `SUPPORT_STAKE_CREATED` |
| OAuth config change | **No** | No API endpoint for OAuth config changes |
| Meeting publish | Yes | `MEETING_PUBLISHED` / `MEETING_REPUBLISHED` |
| Meeting completion | Yes | `MEETING_COMPLETED` |
| Calling proposed | Yes | `CALLING_PROPOSED` |
| Calling extended | Yes | `CALLING_EXTENDED` |
| Calling sustained | Yes | `CALLING_SUSTAINED` |
| Calling set apart | Yes | `CALLING_SET_APART` |
| Support admin bootstrap | Yes | `SUPPORT_ADMIN_BOOTSTRAPPED` |
| Password change | Yes | `ACCOUNT_PASSWORD_CHANGED` |
| Announcement CRUD | Yes | `ANNOUNCEMENT_CREATED` / `ANNOUNCEMENT_DELETED` / `ANNOUNCEMENT_UPDATED` |
| Calendar refresh | Yes | `CALENDAR_REFRESH_MANUAL` |
| Calendar event copy | Yes | `CALENDAR_EVENT_COPIED_TO_ANNOUNCEMENT` |
| Membership import | Yes | `MEMBERSHIP_IMPORT_COMMITTED` |
| Callings import | Yes | `CALLINGS_IMPORT_COMMITTED` |
| Member note added | Yes | `MEMBER_NOTE_ADDED` |
| Support user CRUD | Yes | `SUPPORT_USER_CREATED` / `SUPPORT_USER_UPDATED` / `SUPPORT_USER_DELETED` / `SUPPORT_USER_STATUS_UPDATED` |
| Support provisioning viewed | Yes | `SUPPORT_PROVISIONING_VIEWED` |
| Support users viewed | Yes | `SUPPORT_USERS_VIEWED` |
| Stand script template update | Yes | `STAND_SCRIPT_TEMPLATE_UPDATED` |

**Missing**: OAuth config change audit (no endpoint exists for this). All other required actions are comprehensively logged.

---

## UI-to-API Wiring Issues

### Broken Links
| Link Source | Target | Issue |
|------------|--------|-------|
| `src/auth/navigation.ts` line 33 | `/settings/public-portal` | **Page does not exist** — nav item renders for STAND_ADMIN but clicking it will 404 |

### Dashboard Gaps
| Card | Data Source | Status |
|------|-----------|--------|
| Next meeting | None (hardcoded) | **Hardcoded** — always shows "No meetings scheduled" with no DB query |
| Draft count | None (hardcoded) | **Hardcoded** — always shows "0 drafts" with no DB query |
| Set apart queue | Live DB query | **Working** — queries `calling_assignment` with `SUSTAINED` status |
| Notification health | Live DB query | **Working** — queries `notification_delivery` for failure count |
| Import summary | None (hardcoded) | **Hardcoded** — shows "Pending phase 10" despite Phase 10 being implemented |
| Public portal status | None (hardcoded) | **Hardcoded** — shows "Pending phase 8" despite Phase 8 being implemented |
| Support: User admin | Static link | **Working** — links to `/support/users` |
| Support: Provisioning | Static link | **Working** — links to `/support/provisioning` |

### API Mismatches
| Page | Issue |
|------|-------|
| `/dashboard` | No `GET /api/w/{wardId}/dashboard` route exists — dashboard uses RSC with direct DB queries. This is architecturally valid but doesn't match API.md specification. |
| `/meetings/{id}/edit` | Meeting form `onSubmit` calls `POST /api/w/${wardId}/meetings` (create) or `PUT /api/w/${wardId}/meetings/${meetingId}` (edit) — both correctly wired |
| `/meetings/{id}/edit` | `onPublish` calls `POST /api/w/${wardId}/meetings/${meetingId}/publish` — correctly wired |
| `/settings/users` | `WardUsersManager` fetches from `GET /api/w/${wardId}/users` — correctly wired |
| `/settings/users` | Role assign calls `POST /api/w/${wardId}/users/${userId}/roles` — correctly wired |
| `/settings/users` | Role revoke calls `DELETE /api/w/${wardId}/users/${userId}/roles/${role.id}` — correctly wired |
| `/imports` | Membership import calls `POST /api/w/${wardId}/imports/membership` — correctly wired |
| `/imports` | Callings import calls `POST /api/w/${wardId}/imports/callings` — correctly wired |
| `/imports` | Member notes call `POST /api/w/${wardId}/members/${memberId}/notes` — correctly wired |
| `/announcements` | Uses server actions for create/delete/refresh — bypasses API routes, directly queries DB via RSC. Works but doesn't use the REST API endpoints. |

### Auth Flow Issues
| Issue | Status |
|-------|--------|
| Login → dashboard redirect | **Working** — NextAuth `callbackUrl` + login page redirect logic |
| `must_change_password` flow | **Working** — `enforcePasswordRotation()` redirects to `/account/change-password` |
| User with no ward assignment | **Partial** — `session.activeWardId` will be `null`. Dashboard loads but ward-scoped cards show "Unavailable". Nav shows only Dashboard. No explicit "you have no ward" message shown. |
| Role-based nav hiding | **Working** — `getNavigationItems()` in `src/auth/navigation.ts` checks real roles from session data. Nav items correctly hidden/shown per role. |
| Ward switcher | **Not implemented** — session uses first ward from `ward_user_role` (ORDER BY created_at ASC LIMIT 1). No way to switch wards if user has multiple ward assignments. |

### Silent Failures
| Location | Issue |
|----------|-------|
| All pages | No `loading.tsx` files — React Suspense boundaries missing. Long DB queries will show nothing until complete. |
| All pages | No `error.tsx` files — unhandled errors show Next.js default error page with no recovery option. |
| Dashboard set apart query | Catches errors silently and shows "Unavailable" — acceptable graceful degradation |
| Calendar refresh (login) | Errors caught and swallowed in `signIn` callback (`.catch(() => null)`) — login succeeds but calendar refresh failure is invisible |
| Announcements page | Server action errors throw but are caught by the try/catch — user sees generic Next.js error page |

---

## Summary of Critical Issues (Prioritized)

### P0 — Security / Data Integrity
1. **RLS missing on 17+ ward-scoped tables** — Only `ward_user_role` and `audit_log` have RLS. All other ward tables rely solely on application-level `WHERE ward_id` clauses. A single missed WHERE clause could leak data across wards.
2. **In-memory rate limiting** — Resets on server restart, doesn't work across multiple processes/instances.

### P1 — Missing Functionality
3. **`/settings/public-portal` page missing** — Nav link exists but page 404s.
4. **No public portal token management** — No way to create/manage share tokens or portal tokens through the app.
5. **Auto-add sustain/release business lines missing** — Schema exists but no business logic to auto-populate.
6. **Callings page has no action buttons** — Read-only view, lifecycle transitions are API-only.
7. **Ward switcher not implemented** — Users with multiple ward assignments cannot switch.

### P2 — Incomplete Features
8. **Dashboard cards hardcoded** — Next meeting, draft count, import summary, and portal status cards show static text.
9. **Raw paste purge job missing** — Import data retention not enforced.
10. **`npm run build` and `npm run test` are placeholders** — Don't actually build or test.
11. **No loading/error states** — No `loading.tsx` or `error.tsx` files anywhere.
12. **Prettier not configured** — Specified in PLANS.md but not set up.

### P3 — Polish / Documentation
13. **Version is 0.1.0 not 1.0.0** — Release candidate version not tagged.
14. **E2E tests need seed data** — `acceptance.spec.ts` uses hardcoded UUIDs that require a test database seed.
15. **Hardening test references missing files** — `production-readiness.vitest.ts` reads `server.mjs` and `bootstrap.mjs` which don't exist.
16. **Shared package has placeholder validators** — `zodValidatorsPlaceholder` note says "Replace with real zod validators in a later milestone."

---

*End of Gap Analysis*
