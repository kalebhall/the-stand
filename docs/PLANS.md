
# PLANS.md — The Stand (Master Implementation Plan)

This document defines the complete phased implementation plan for The Stand.
It is the authoritative execution roadmap for developers and AI agents.

All development must follow milestone order unless explicitly revised.

============================================================
FOUNDATIONAL RULES
============================================================

1. Ward isolation is non-negotiable (API + RLS).
2. Support Admin bootstrap (Option 1) must be implemented exactly as specified.
3. Public endpoints never accept ward_id.
4. No features outside SRS.md may be introduced.
5. Every milestone must pass lint, typecheck, tests, and build before moving forward.
6. Cross-ward access must be tested at DB level.
7. All admin/support actions must be audited.

============================================================
PHASE 0 — REPOSITORY FOUNDATION
============================================================

Objective:
Create stable monorepo structure and CI pipeline.

Tasks:
- Scaffold Next.js (App Router) + TypeScript app.
- Add Tailwind + shadcn/ui.
- Configure ESLint + Prettier.
- Add Vitest test runner.
- Add CI (lint, typecheck, test, build).
- Create .env.example.
- Add AGENTS.md, ARCHITECTURE.md, SCHEMA.md, API.md, UI.md, PERMISSIONS.md, ACCEPTANCE.md.

Acceptance Gate:
- npm run build succeeds
- CI passes

============================================================
PHASE 1 — DATABASE & RLS FOUNDATION
============================================================

Objective:
Establish tenancy isolation at DB layer.

Tasks:
- Install PostgreSQL locally.
- Add Drizzle ORM + migration system.
- Create base tables:
  stake, ward, user_account, role, ward_user_role, audit_log.
- Enable Row Level Security on ward tables.
- Create RLS policies referencing current_setting('app.ward_id').
- Implement DB context setter per request.
- Write test proving cross-ward query fails.

Acceptance Gate:
- Cross-ward access blocked at DB level.
- RLS verified in tests.

============================================================
PHASE 2 — AUTHENTICATION & BOOTSTRAP
============================================================

Objective:
Implement secure login and Support Admin bootstrap.

Tasks:
- Integrate Auth.js with Google OAuth.
- Add credentials provider (optional password).
- Implement Argon2id hashing.
- Implement bootstrap logic:
  - Generate random password (≥24 chars)
  - Print once to logs
  - Set must_change_password = true
- Implement forced change-password flow.
- Implement rate limiting on login/reset endpoints.
- Add /api/me endpoint.

Acceptance Gate:
- Support Admin created automatically on first run.
- Password forced rotation works.
- Google login works.
- Password endpoints rate limited.

============================================================
PHASE 3 — ROLE & PERMISSION MODEL
============================================================

Objective:
Implement RBAC enforcement.

Tasks:
- Implement role → permission mapping.
- Add requireRole/requirePermission helpers.
- Protect all ward routes.
- Implement Ward Admin user management UI.
- Implement Support Admin console (stake/ward provisioning).
- Audit all admin/support actions.

Acceptance Gate:
- Ward Admin cannot modify other wards.
- Support Admin can provision wards.
- All actions logged.

============================================================
PHASE 4 — DASHBOARD & CORE UI
============================================================

Objective:
Implement post-login experience.

Tasks:
- Create /dashboard route.
- Add role-aware dashboard cards.
- Implement landing page + request access flow.
- Implement logout page.

Acceptance Gate:
- Login → dashboard redirect works.
- Access request stored in DB.

============================================================
PHASE 5 — MEETINGS MVP
============================================================

Objective:
Enable meeting creation and publishing.

Tasks:
- Create meeting CRUD.
- Add hymns (number + title snapshot).
- Add ordered program items.
- Implement publish action → immutable snapshot.
- Implement republish versioning.
- Implement printable view.
- Implement meeting completion flow.

Acceptance Gate:
- Ward can create and publish meeting.
- Snapshot immutable after publish.
- Print view functional.

============================================================
PHASE 6 — AT THE STAND VIEW
============================================================

Objective:
Tablet-friendly conducting interface.

Tasks:
- Implement /stand/{meeting_id}.
- Add Formal Script mode.
- Add Compact Labels mode.
- Bold name + calling in sustain/release phrasing.
- Add visitor-friendly welcome text.

Acceptance Gate:
- View loads under 2 seconds.
- Formatting correct.
- Tablet responsive.

============================================================
PHASE 7 — CALLINGS WORKFLOW
============================================================

Objective:
Track proposed → extended → sustained → set apart.

Tasks:
- Create calling_assignment & calling_action tables.
- Auto-add sustain/release business lines.
- Implement Set Apart Queue.
- Send notifications to bishopric and clerks.
- Include explicit LCR instruction in notifications.

Acceptance Gate:
- Sustain triggers business line.
- Completion triggers notification.
- Set apart triggers clerk reminder.

============================================================
PHASE 8 — PUBLIC PROGRAM PORTAL
============================================================

Objective:
Enable QR-accessible public program.

Tasks:
- Implement /p/{meeting_token}.
- Implement stable ward portal token.
- Ensure only published snapshots render.
- Ensure no internal data exposed.
- Add token rotation.

Acceptance Gate:
- QR link always routes to current meeting.
- Unpublished meetings inaccessible publicly.

============================================================
PHASE 9 — ANNOUNCEMENTS & CALENDAR
============================================================

Objective:
Integrate ICS feeds and announcement management.

Tasks:
- Add calendar_feed table.
- Implement ICS refresh (login-triggered + manual).
- Add cache pruning job.
- Add copy-to-announcement feature via tag map.
- Implement permanent announcement flag.

Acceptance Gate:
- Calendar imports correctly.
- Announcements display correctly.

============================================================
PHASE 10 — IMPORT SYSTEM
============================================================

Objective:
Support membership & calling paste imports.

Tasks:
- Enforce plain-text paste input.
- Parse membership format.
- Parse callings format.
- Implement dry-run preview.
- Implement conflict resolution.
- Implement commit stage.
- Purge raw paste after retention window.

Acceptance Gate:
- Import handles malformed spacing.
- Dry run displays accurate preview.
- Commit updates DB correctly.

============================================================
PHASE 11 — NOTIFICATIONS & OUTBOX
============================================================

Objective:
Reliable event-driven notifications.

Tasks:
- Implement event_outbox table.
- Implement notification_delivery tracking.
- Implement dedupe constraint.
- Add BullMQ worker (or DB poller).
- Add webhook (n8n) integration.
- Optional SMTP integration.
- Add diagnostics UI.

Acceptance Gate:
- Notifications retry on failure.
- No duplicate sends.
- Diagnostics visible.

============================================================
PHASE 12 — HARDENING & VALIDATION
============================================================

Objective:
Production readiness.

Tasks:
- Implement /health endpoint.
- Validate Nginx config.
- Validate systemd service.
- Confirm PostgreSQL local-only.
- Confirm RLS enabled everywhere.
- Configure backups + retention.
- Perform restore test.
- Validate rate limiting.
- Review audit logging coverage.

Acceptance Gate:
- All ACCEPTANCE.md scenarios pass.
- Security checklist complete.
- Disaster recovery tested.

============================================================
PHASE 13 — RELEASE CANDIDATE
============================================================

Objective:
Prepare production release.

Tasks:
- Tag version (v1.0.0).
- Generate release notes.
- Freeze schema.
- Perform full regression test.
- Verify bootstrap path again.
- Document deployment checklist.

Acceptance Gate:
- Clean deploy on fresh Ubuntu VM.
- Bootstrap flow verified.
- Ward meeting successfully published and conducted.

============================================================
FAILURE RULE
============================================================

If any milestone introduces:
- Cross-ward data leakage
- Disabled RLS
- Public exposure of internal data
- Hardcoded secrets
- Skipped audit logging

Stop development and correct before proceeding.

============================================================
END OF PLANS.md
============================================================
