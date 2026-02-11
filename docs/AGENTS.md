
# AGENTS.md — The Stand (Master Build Rules for Codex & Contributors)

This file is the authoritative behavioral contract for any AI agent,
developer, or automation working on The Stand.

It consolidates ALL architectural, security, tenancy, and implementation
requirements. Nothing in this file may be ignored.

============================================================
1. PROJECT PURPOSE
============================================================

The Stand is a ward‑scoped web application that assists leaders in:
- Preparing sacrament meetings
- Conducting meetings (At‑the‑Stand view)
- Publishing printable/public programs
- Tracking sustainings, releases, and set-aparts
- Sending reminders to record actions in LCR

The Stand NEVER:
- Integrates directly with LCR
- Writes to Church systems
- Shares data across wards

============================================================
2. CORE NON‑NEGOTIABLE PRINCIPLES
============================================================

1. Absolute Ward Isolation
2. Defense-in-depth security (RBAC + RLS)
3. Public pages are read-only published snapshots
4. Support Admin bootstrap must be secure
5. No hardcoded secrets
6. No cross-ward data exposure ever
7. Follow PLANS.md milestone order
8. Do not invent features outside SRS.md

============================================================
3. TENANCY MODEL
============================================================

Hierarchy:
Stake → Ward

Stake exists for provisioning only.

All ward-scoped tables MUST:
- Include ward_id
- Have PostgreSQL Row Level Security enabled
- Have explicit RLS policies referencing ward context

Public routes MUST NEVER accept ward_id.

============================================================
4. SECURITY ARCHITECTURE
============================================================

Layers:
1. API permission enforcement (RBAC)
2. Ward context validation
3. PostgreSQL RLS enforcement

RLS is mandatory and must not be bypassed.

Secrets:
- OAuth secrets encrypted at rest
- SESSION_SECRET never committed
- .env must be 600 permissions

Password Security:
- Argon2id hashing
- Rate limiting login/reset endpoints
- Forced password rotation for bootstrap admin

============================================================
5. SUPPORT ADMIN BOOTSTRAP (OPTION 1)
============================================================

On startup:
If no SUPPORT_ADMIN exists:
- Generate cryptographically secure random password (≥24 chars)
- Create Support Admin using SUPPORT_ADMIN_EMAIL (env var)
- Print password ONE TIME to logs
- Store only hash
- Set must_change_password = true

On first login:
- Redirect to change-password
- Block navigation until password updated
- Record last_password_change_at

Plaintext password must never be stored or redisplayed.

============================================================
6. AUTHENTICATION
============================================================

Primary: Google OAuth (OIDC via Auth.js)
Optional: Email/password (if enabled)

Google users:
- No password UI
- No password change

Password users:
- May change password
- May reset password
- Rate limited endpoints

============================================================
7. ROLES
============================================================

Global Roles:
- SUPPORT_ADMIN
- SYSTEM_ADMIN

Ward Roles:
- STAND_ADMIN
- BISHOPRIC_EDITOR
- CLERK_EDITOR
- WARD_CLERK
- MEMBERSHIP_CLERK
- CONDUCTOR_VIEW

Ward Admin may:
- Manage ward users
- Assign/revoke ward roles
- Manage templates
- Manage public portal

Support Admin may:
- Create stakes
- Create wards
- Assign ward admins
- Configure OAuth
- Review access requests

All support/admin actions must be audited.

============================================================
8. MEETINGS & PROGRAMS
============================================================

Features:
- Create/edit meeting
- Add hymns (number + title snapshot)
- Ordered program items
- Publish immutable snapshot
- Republish creates new version
- Print-friendly render

Meeting Types:
- Sacrament
- Fast & Testimony
- Ward Conference
- Stake Conference (informational)
- General Conference (Mode A only)

============================================================
9. AT THE STAND
============================================================

Route: /stand/{meeting_id}

Modes:
- Formal Script
- Compact Labels

Requirements:
- Bold member name and calling in sustain/release phrasing
- Visitor-friendly welcome text
- Tablet-friendly layout

============================================================
10. CALLINGS WORKFLOW
============================================================

Lifecycle:
proposed → extended → sustained → set apart

Requirements:
- Auto-add business lines
- Set Apart Queue
- Clerk reminder notifications include explicit LCR instruction

============================================================
11. BUSINESS LINES
============================================================

Statuses:
- pending
- included
- excluded
- announced

Only announced items trigger completion notifications.

============================================================
12. PUBLIC PROGRAM PORTAL
============================================================

Routes:
/p/{meeting_token}
/p/ward/{portal_token}

Rules:
- Published snapshot only
- No internal data exposed
- Stable QR portal
- Token rotation supported

============================================================
13. IMPORTS
============================================================

Membership & Callings paste:
- Enforce plain-text input
- Dry run preview
- Conflict resolution
- Commit phase
- Retention window purge of raw text

============================================================
14. ANNOUNCEMENTS & CALENDAR
============================================================

Announcements:
- Date window
- Permanent flag
- Placement control

Calendar:
- Multiple ICS feeds
- Auto refresh on login
- Manual refresh
- Cache prune after 7 days
- Copy to announcements via tag map

============================================================
15. NOTIFICATIONS
============================================================

Use Outbox Pattern:
- event_outbox table
- notification_delivery tracking
- Deduplication constraint
- Retry logic
- Diagnostics UI

Channels:
- Webhook (n8n default)
- Optional email

============================================================
16. DEVELOPMENT RULES
============================================================

- TypeScript only
- Use migrations for all DB changes
- Enable RLS in migrations
- Never disable RLS for convenience
- Write tests for cross-ward isolation
- Keep API surface aligned with API.md
- Keep UI aligned with UI.md
- Follow ACCEPTANCE.md scenarios

============================================================
17. DEPLOYMENT EXPECTATIONS
============================================================

Target:
Ubuntu server with:
- Local PostgreSQL
- Nginx reverse proxy
- systemd service
- HTTPS via Certbot
- Automated backups

Production hardening must follow HARDENING.md.

============================================================
18. FINAL RULE
============================================================

If any implementation decision risks:
- Cross-ward data leakage
- Public exposure of internal data
- Hardcoded secrets
- Bypassing RLS
- Skipping audit logging

STOP and fix the design.

============================================================
END OF AGENTS.md
============================================================
