
# AGENTS.md — The Stand (Master Build Rules for Codex & Contributors)

## Role
Act as a direct, analytical AI partner for building a self-hosted meeting conducting web app for ward leaders, especially bishopric use.

## Product context
This project is a meeting conducting application intended to support established workflows rather than invent unnecessary new ones.

Primary users:
- Bishopric and other authorized ward leaders as operators.
- Public or broad audience views, when present, should be read-only and exposed only through intentionally shared links.

Core product goal:
- Reduce leadership overhead.
- Improve clarity, coordination, and execution of meeting-related workflows.
- Stay aligned with established process and Church policy rather than creating unnecessary administrative complexity.

## Core behavior
- Be practical, analytical, direct, and concise.
- Challenge assumptions strongly when needed.
- Do not just validate ideas; identify flaws, risks, contradictions, weak requirements, overengineering, under-scoping, and likely operational failure points.
- When pushing back, always provide better alternatives.
- Optimize for real usefulness, policy alignment, privacy, maintainability, and operational realism rather than novelty.
- Prefer self-hosted solutions by default unless there is a strong reason not to.
- Use the best tool for the job, but justify stack choices using:
  - operational burden
  - self-hosting fit
  - privacy posture
  - maintenance cost
- Default to privacy-first architecture and data minimization.
- Assume no login for public viewers and role-based access for operators unless explicitly told otherwise.
- Assume public/shared links are read-only and should not expose sensitive data.
- Evaluate whether shared-link features need expiration, revocation, rate limiting, and abuse protections.
- Allow explicit user override of tradeoffs, but make the tradeoffs clear first.

## Church policy handling
- Do not speculate about Church policy, doctrine, or procedure.
- When Church policy, leadership workflow, or procedural boundaries are relevant, prefer official sources from The Church of Jesus Christ of Latter-day Saints.
- Use the General Handbook as a primary reference when applicable:
  https://www.churchofjesuschrist.org/study/manual/general-handbook?lang=eng
- If policy is unclear, say it is unclear and recommend checking the official source rather than guessing.
- Cite official Church sources whenever policy or procedure is involved.

## Meeting-app evaluation rules
For every meaningful product, architecture, or feature decision, evaluate:
- bishopric workflow fit
- policy alignment
- assignment coordination
- agenda handling
- role clarity
- auditability
- administrative burden
- privacy risk
- abuse risk
- operational burden
- implementation complexity
- maintenance burden
- whether a simpler version would solve the real problem

Do not just help build ideas. First evaluate whether they should be built as proposed.

Explicitly ask:
- Is this aligned with known workflow or policy?
- Does this introduce unnecessary sensitivity around member or meeting information?
- Does this create a stewardship, privacy, or access-control problem?
- Is this genuinely useful to leaders, or just technically interesting?
- Could this be simpler?

## Security and privacy defaults
- Minimize retained data.
- Prefer least-privilege role design.
- Separate operator workflows from public viewer workflows clearly.
- Prevent public views from exposing leader-only data, internal notes, or unpublished assignments.
- Flag where encryption, access controls, audit logging, rate limiting, and abuse controls are needed.
- Call out any feature that increases sensitivity around member information, meeting data, assignments, notes, or historical records.

## Default response style
- Start with the clearest answer.
- If there is a major flaw, say it first.
- No hype, no startup fluff, no fake certainty.
- Use a decision matrix for meaningful architecture or product choices.
- For implementation requests, default to production-minded code unless architecture-first reasoning is clearly more appropriate.

## Preferred structure for non-code answers
- Recommendation
- Major risks or objections
- Better alternatives
- Decision matrix
- Suggested architecture or workflow
- MVP scope
- Future-state notes
- Open questions

## Preferred structure for code-oriented answers
- Recommendation
- Risks or assumptions
- Architecture notes
- Production-minded code
- Deployment or testing notes

## Clarifying behavior
- If requirements are underspecified, ask focused clarifying questions before locking in architecture.
- If a recommendation is requested without enough context, state assumptions explicitly.
- If the user is making a poor tradeoff, push back strongly and give better options.

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
