# API.md — The Stand (Master API Specification)

This document defines the complete HTTP API surface for The Stand.
It includes authentication behavior, ward-scoped routes, support-admin routes,
public routes, permissions, request/response contracts, and security rules.

All routes are JSON unless otherwise noted.

Base URL (production example):
https://stand.yourdomain.com

====================================================================
GLOBAL API RULES
====================================================================

1. All authenticated routes require valid session.
2. All ward-scoped routes must:
   - Validate session
   - Validate ward context
   - Enforce RBAC
   - Rely on PostgreSQL RLS for final enforcement
3. Public routes NEVER accept ward_id.
4. All write actions must be audit logged.
5. Errors must not leak internal details.

Standard Error Response:
{
"error": "string",
"code": "ERROR_CODE"
}

====================================================================
AUTHENTICATION ROUTES
====================================================================

Auth handled via Auth.js (NextAuth):

GET /api/auth/signin
POST /api/auth/callback/google
POST /api/auth/callback/credentials
POST /api/auth/signout

---

GET /api/me
--------------------------------------------------

Returns current authenticated user and active ward context.

Response:
{
"user": {
"id": "uuid",
"email": "user@example.com",
"displayName": "Name"
},
"activeWardId": "uuid",
"roles": ["STAND_ADMIN"]
}

---

POST /api/account/change-password
--------------------------------------------------

Requires:

- Authenticated
- Not Google-only user

Body:
{
"currentPassword": "string",
"newPassword": "string"
}

Enforces:

- Argon2 verify
- Rate limiting

---

POST /api/account/forgot-password (optional)
POST /api/account/reset-password (optional)

Token-based reset flow.

====================================================================
PUBLIC ROUTES
====================================================================

---

POST /api/public/access-requests
--------------------------------------------------

Body:
{
"name": "string",
"email": "string",
"stake": "string",
"ward": "string",
"message": "string"
}

Creates access_request record.

---

GET /p/{meetingToken}
--------------------------------------------------

Returns published snapshot HTML.
No JSON.
No internal data.

---

GET /p/ward/{portalToken}
--------------------------------------------------

Resolves current published meeting for ward.
Returns published snapshot HTML.

====================================================================
WARD-SCOPED ROUTES
====================================================================

All ward routes follow pattern:

/api/w/{wardId}/...

WardId must match active ward in session.

---

GET /api/w/{wardId}/dashboard
--------------------------------------------------

Returns dashboard summary.

Response:
{
"nextMeeting": {...},
"draftCount": 1,
"setApartQueue": 2,
"notificationHealth": {...}
}

---

MEETINGS
--------------------------------------------------

GET /api/w/{wardId}/meetings
POST /api/w/{wardId}/meetings
GET /api/w/{wardId}/meetings/{meetingId}
PUT /api/w/{wardId}/meetings/{meetingId}
DELETE /api/w/{wardId}/meetings/{meetingId}

POST /api/w/{wardId}/meetings/{meetingId}/publish
POST /api/w/{wardId}/meetings/{meetingId}/complete

Publish:

- Generates immutable snapshot
- Increments version

Complete:

- Processes announced business lines
- Creates outbox events

---

BUSINESS LINES
--------------------------------------------------

GET /api/w/{wardId}/meetings/{meetingId}/business-lines
POST /api/w/{wardId}/meetings/{meetingId}/business-lines
PUT /api/w/{wardId}/business-lines/{id}

Status transitions allowed only by RBAC roles.

---

CALLINGS
--------------------------------------------------

GET /api/w/{wardId}/callings
POST /api/w/{wardId}/callings
POST /api/w/{wardId}/callings/{id}/extend
POST /api/w/{wardId}/callings/{id}/sustain
POST /api/w/{wardId}/callings/{id}/set-apart

Sustain action auto-creates business line entry.

---

ANNOUNCEMENTS
--------------------------------------------------

GET /api/w/{wardId}/announcements
POST /api/w/{wardId}/announcements
PUT /api/w/{wardId}/announcements/{id}
DELETE /api/w/{wardId}/announcements/{id}

---

CALENDAR
--------------------------------------------------

GET /api/w/{wardId}/calendar
POST /api/w/{wardId}/calendar/refresh

---

IMPORTS
--------------------------------------------------

POST /api/w/{wardId}/imports/membership
POST /api/w/{wardId}/imports/callings

Body:
{
"rawText": "string"
}

Flow:

- Parse
- Return preview
- Commit flag required to finalize
- On commit failures, record `MEMBERSHIP_IMPORT_FAILED` in `audit_log` with error details

Operational logging:

- Server log verbosity is controlled by `LOG_LEVEL` (`debug`, `info`, `warn`, `error`)
- Set in `.env` (example: `LOG_LEVEL=debug`) when troubleshooting import behavior

---

USERS (WARD ADMIN)
--------------------------------------------------

GET /api/w/{wardId}/users
POST /api/w/{wardId}/users/{userId}/roles
DELETE /api/w/{wardId}/users/{userId}/roles/{roleId}

Must enforce STAND_ADMIN role.

====================================================================
SUPPORT ADMIN ROUTES
====================================================================

Prefix:
/api/support

Requires SUPPORT_ADMIN role.

POST /api/support/stakes
POST /api/support/wards
POST /api/support/wards/{wardId}/admins
GET /api/support/access-requests
PUT /api/support/oauth

All actions audit logged.

====================================================================
NOTIFICATIONS & OUTBOX
====================================================================

Internal worker processes:

- Reads event_outbox
- Sends webhook/email
- Updates notification_delivery
- Retries failed deliveries
- Deduplicates by unique constraint

Diagnostics route:

GET /api/w/{wardId}/notifications/diagnostics

====================================================================
HEALTH CHECK
====================================================================

GET /health

Response:
{
"status": "ok",
"db": "connected",
"version": "1.0.0"
}

====================================================================
RATE LIMITING
====================================================================

Must apply to:

- Login endpoints
- Password reset
- Public access request

Optional:

- Global API rate limiting via Nginx

====================================================================
AUDIT LOGGING
====================================================================

All actions modifying:

- Roles
- Meetings
- Publish/complete
- Callings transitions
- OAuth config
- Stake/ward provisioning

Must insert record into audit_log.

====================================================================
NOTIFICATION ROUTES
====================================================================

GET /api/w/{wardId}/notification-subscriptions
PUT /api/w/{wardId}/notification-subscriptions

Authenticated users may read and update only their own subscriptions in active ward. PUT accepts `{ "subscriptions": [{ "eventType": "MEETING_PUBLISHED", "channel": "IN_APP|EMAIL", "enabled": true }] }`.

GET /api/w/{wardId}/notifications?filter=all|unread&category=CALLINGS&limit=50
PATCH /api/w/{wardId}/notifications/{notificationId}
POST /api/w/{wardId}/notifications/mark-all-read

Notification reads and mutations require both matching ward and recipient user identity. PATCH action is `read` or `dismiss`. Invalid event types/channels return `VALIDATION_ERROR`.

Email subscriptions require configured `NOTIFICATION_EMAIL_WEBHOOK_URL`; email delivery is asynchronous, per-recipient, privacy-safe, and independently tracked. Missing configuration records deterministic delivery failure.

====================================================================
FAILURE RULE
====================================================================

If any route:

- Accepts ward_id publicly
- Bypasses RBAC
- Returns cross-ward data
- Skips audit logging

It must be corrected immediately.

====================================================================
PROGRAM DESIGNER FOUNDATION ROUTES (MILESTONE 1)
====================================================================

GET /api/w/{wardId}/program-settings

Requires an active ward and program-designer view permission. Returns the
persisted program permission profile, defaulting safely to false when no
ward_document_settings row exists.

PATCH /api/w/{wardId}/program-settings

Requires STAND_ADMIN, validates boolean program settings, persists them under
RLS, and writes PROGRAM_SETTINGS_UPDATED to audit_log. Database failures return
INTERNAL_ERROR without exposing provider details.

PROGRAM_EDITOR is intentionally excluded from general meeting-management
permissions. Program-specific helpers enforce designer, media, template,
advanced-mode, publish, republish, and rollback boundaries.

====================================================================
PROGRAM DESIGNER COMPATIBILITY RENDERING (MILESTONE 2)
====================================================================

Authenticated draft print and publication resolve `meeting_document.layout_json`
when present. The layout is validated and rendered through the generic
Document Designer renderer. If no meeting document exists, the existing
`public_program_layout` presets remain the fallback.

Publication still writes immutable `meeting_program_render` snapshots and
reuses `public_program_share` tokens. Public portal/token routes continue to
serve stored snapshots and never render a live draft. Internal-only document
blocks are rejected by the server-side public-safety boundary.

====================================================================
PROGRAM DESIGNER TEMPLATES AND PROGRAMS (MILESTONE 3)
====================================================================

GET /api/w/{wardId}/document-templates

Returns validated built-in templates plus published stake/ward templates and
current-user personal drafts visible in the active ward. Built-ins are read-only
and use stable string keys.

POST /api/w/{wardId}/document-templates

Creates a ward or personal draft for an authorized template manager. The full
layout is parsed before persistence, version 1 is created in the same
transaction, and database failures return INTERNAL_ERROR.

GET /api/w/{wardId}/document-templates/{templateId}
POST /api/w/{wardId}/document-templates/{templateId}/duplicate
GET|POST /api/w/{wardId}/document-templates/{templateId}/versions
POST /api/w/{wardId}/document-templates/{templateId}/publish

These routes enforce source scope and active-ward authorization. Duplication
never grants write access to the source. Versions are append-only; publishing
moves the template pointer to a selected immutable version and records an audit
event. System/stake templates cannot be edited or published by ward users.

`/programs` is the authenticated upcoming-program landing page and
`/programs/templates` is the role-gated template gallery. Meeting creation
copies the selected published ward template version into `meeting_document`,
with Full Page Standard as the no-default fallback.

====================================================================
PROGRAM DESIGNER SIMPLE MODE (MILESTONE 4)
====================================================================

`/programs/{meetingId}` is the authenticated Simple Mode editor. It exposes
only approved block visibility/order/content and curated theme controls. The
editor uses `GET/PUT/POST /api/w/{wardId}/meetings/{meetingId}/program-design`.
PUT requires `expectedRevision`, validates the complete layout, and updates
only `meeting_document`; stale revisions return `REVISION_CONFLICT`. POST
validates a draft and public safety without publishing. Autosave is debounced
and in-memory only. Advanced Mode now adds capability-gated schema-v2 layout operations, server-enforced locks, and revision-safe persistence. Deterministic PDF generation remains deferred to Milestone 7.

====================================================================
PROGRAM DESIGNER MEDIA (MILESTONE 6)
====================================================================

`GET|POST /api/w/{wardId}/media` lists active media readable by the active ward
or uploads a ward-scoped JPEG, PNG, or WebP image. Uploads use MIME sniffing,
decode/re-encode normalization, bounded size/dimensions, opaque storage keys,
and required alt text unless marked decorative. `DELETE /api/w/{wardId}/media/{assetId}`
archives only an unreferenced ward asset. `GET /media/{publicToken}` serves
only an active public-safe asset. IMAGE blocks reference `assetId`; arbitrary
image URLs are rejected by the document schema.

====================================================================
END OF API.md
