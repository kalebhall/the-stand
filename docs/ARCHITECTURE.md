
# ARCHITECTURE.md — The Stand (Master Architecture Specification)

This document defines the complete architectural blueprint for The Stand.
It consolidates infrastructure, application structure, security model,
data model enforcement, authentication flows, background processing,
deployment topology, and operational considerations.

This file is authoritative.

============================================================
1. HIGH-LEVEL SYSTEM OVERVIEW
============================================================

The Stand is a ward-scoped web application that assists local leaders in:

- Preparing sacrament meetings
- Conducting meetings (At-the-Stand view)
- Publishing printable and public programs
- Tracking sustainings, releases, and set-aparts
- Sending reminders to record actions in LCR

The Stand:
- Supplements (never replaces) official Church systems
- Never writes to LCR
- Never shares data across wards

============================================================
2. DEPLOYMENT TOPOLOGY (UBUNTU SELF-HOSTED)
============================================================

Target Environment:
- Ubuntu Server 22.04/24.04
- Local PostgreSQL instance
- Node.js (LTS)
- Nginx reverse proxy
- systemd process management
- Optional Redis (for background jobs)
- HTTPS via Certbot (Let’s Encrypt)

Architecture Layers:

Client (Browser)
      ↓ HTTPS
Nginx Reverse Proxy
      ↓
Node.js Application (Next.js)
      ↓
PostgreSQL (local)
      ↓
Optional Redis (BullMQ background jobs)

============================================================
3. APPLICATION STACK
============================================================

Frontend + Backend:
- Next.js (App Router)
- TypeScript

UI:
- Tailwind CSS
- shadcn/ui components

Authentication:
- Auth.js (NextAuth)
- Google OAuth (primary)
- Optional email/password (credential provider)

Password Hashing:
- Argon2id

Database:
- PostgreSQL 15+
- Drizzle ORM (recommended)
- SQL migrations required

Background Jobs:
- BullMQ + Redis (recommended)
- Used for:
  - Outbox dispatch
  - Calendar refresh
  - Cache pruning
  - Retry handling

============================================================
4. TENANCY & ISOLATION MODEL
============================================================

Hierarchy:
Stake → Ward

Stake exists for provisioning only.

All ward-scoped tables MUST:
- Include ward_id
- Enable PostgreSQL Row Level Security (RLS)
- Have explicit RLS policies

Example RLS pattern:

CREATE POLICY ward_isolation ON meeting
USING (ward_id = current_setting('app.ward_id')::uuid);

The application MUST set per-request context:

SET LOCAL app.user_id = '...';
SET LOCAL app.ward_id = '...';

Public endpoints MUST NOT accept ward_id.

============================================================
5. SECURITY ARCHITECTURE (DEFENSE IN DEPTH)
============================================================

Layer 1: API RBAC Enforcement
- Every protected route must verify:
  - Authenticated user
  - Active ward context
  - Required permission

Layer 2: Ward Context Validation
- Ward ID in route must match session ward
- User must have role in that ward

Layer 3: Database RLS
- Prevents cross-ward leakage even if API bug exists

Secrets:
- SESSION_SECRET stored in .env
- OAuth client secret encrypted at rest
- .env file permission 600
- No secrets committed to repo

Password Endpoints:
- Rate limited
- No verbose error messages

============================================================
6. SUPPORT ADMIN BOOTSTRAP (OPTION 1)
============================================================

Startup Behavior:

If no user exists with SUPPORT_ADMIN role:
- Generate secure random password (≥ 24 chars)
- Create Support Admin using SUPPORT_ADMIN_EMAIL (env var)
- Hash password using Argon2id
- Print password ONCE to logs
- Set must_change_password = true

First Login Flow:
- Redirect to /account/change-password
- Block all navigation until changed
- Record last_password_change_at

Plaintext password must never be stored.

============================================================
7. AUTHENTICATION FLOWS
============================================================

Google OAuth Flow:
Browser → Google → Callback → Session creation

Password Flow:
Browser → Credentials provider → Argon2 verify → Session

Password reset (optional):
- Token-based reset
- Expiration enforced
- Rate limited

Session Model:
- Stores user_id
- Stores active ward_id
- Must be validated on every request

============================================================
8. ROLE & PERMISSION MODEL
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

Authorization Model:
role → permissions → API enforcement

Ward Admin:
- Manages ward users
- Assigns/revokes roles
- Manages templates
- Manages public portal

Support Admin:
- Creates stakes
- Creates wards
- Assigns ward admins
- Configures OAuth
- Reviews access requests

All admin/support actions logged to audit_log.

============================================================
9. MEETINGS ARCHITECTURE
============================================================

Core Tables:
- meeting
- meeting_program_item
- meeting_program_render
- meeting_business_line

Publish Flow:
1. Editor updates draft
2. Publish action generates immutable render snapshot
3. meeting_program_render stored
4. Previous version preserved

Completion Flow:
- Only announced business lines processed
- Outbox events created
- Notifications dispatched

============================================================
10. AT-THE-STAND VIEW
============================================================

Route: /stand/{meeting_id}

Modes:
- Formal Script
- Compact Labels

Requirements:
- Bold name + calling in sustain/release phrases
- Tablet-friendly layout
- Must load quickly (<2 seconds target)

============================================================
11. CALLINGS WORKFLOW ARCHITECTURE
============================================================

Tables:
- calling_assignment
- calling_action
- set_apart_record

Lifecycle:
proposed → extended → sustained → set apart

Sustained → Auto-create business line entry
Completion → Notify bishopric & clerks
Set apart → Notify clerks (LCR reminder)

============================================================
12. PUBLIC PROGRAM ARCHITECTURE
============================================================

Routes:
/p/{meeting_token}
/p/ward/{portal_token}

Rules:
- Render only published snapshot
- No internal data exposed
- Token validation required
- Token rotation supported

============================================================
13. ANNOUNCEMENTS & CALENDAR
============================================================

Calendar:
- Multiple ICS feeds per ward
- Auto-refresh on login
- Manual refresh endpoint
- Cache pruning job

Announcements:
- Date window logic
- Permanent flag
- Tag mapping for calendar copy

============================================================
14. IMPORTS SYSTEM
============================================================

Input:
- Plain text only (strip HTML/PDF artifacts)

Workflow:
1. Paste
2. Parse
3. Dry run preview
4. Conflict resolution
5. Commit
6. Purge raw text after retention window

============================================================
15. NOTIFICATION ARCHITECTURE
============================================================

Outbox Pattern:

event_outbox
notification_delivery

Flow:
1. Insert event
2. Worker processes queue
3. Delivery recorded
4. Retry on failure
5. Deduplicate by constraint

Channels:
- Webhook (n8n default)
- Optional SMTP/email

============================================================
16. HEALTH & MONITORING
============================================================

Health Endpoint:
/health

Response:
{
  status: "ok",
  db: "connected",
  version: "x.x.x"
}

Monitoring:
- Netdata or Uptime Kuma
- Monitor CPU, memory, disk, DB connectivity

============================================================
17. BACKUP & DISASTER RECOVERY
============================================================

Daily pg_dump backups
14-day retention
Optional offsite sync

Quarterly restore test required.

============================================================
18. PRODUCTION HARDENING
============================================================

- SSH hardened (no root login)
- Fail2ban enabled
- UFW minimal ports (22,80,443)
- TLS 1.2+ only
- PostgreSQL localhost only
- Journal log limits configured
- Rate limiting at API or Nginx

============================================================
19. FAILURE SAFETY RULE
============================================================

If any implementation decision risks:
- Cross-ward data leakage
- Public exposure of internal data
- Hardcoded secrets
- Disabling RLS
- Skipping audit logging

STOP and correct the design.

============================================================
END OF ARCHITECTURE.md
============================================================
