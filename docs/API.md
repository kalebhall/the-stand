
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

GET    /api/auth/signin
POST   /api/auth/callback/google
POST   /api/auth/callback/credentials
POST   /api/auth/signout

--------------------------------------------------
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

--------------------------------------------------
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

--------------------------------------------------
POST /api/account/forgot-password (optional)
POST /api/account/reset-password (optional)

Token-based reset flow.

====================================================================
PUBLIC ROUTES
====================================================================

--------------------------------------------------
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

--------------------------------------------------
GET /p/{meetingToken}
--------------------------------------------------

Returns published snapshot HTML.
No JSON.
No internal data.

--------------------------------------------------
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

--------------------------------------------------
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

--------------------------------------------------
MEETINGS
--------------------------------------------------

GET    /api/w/{wardId}/meetings
POST   /api/w/{wardId}/meetings
GET    /api/w/{wardId}/meetings/{meetingId}
PUT    /api/w/{wardId}/meetings/{meetingId}
DELETE /api/w/{wardId}/meetings/{meetingId}

POST   /api/w/{wardId}/meetings/{meetingId}/publish
POST   /api/w/{wardId}/meetings/{meetingId}/complete

Publish:
- Generates immutable snapshot
- Increments version

Complete:
- Processes announced business lines
- Creates outbox events

--------------------------------------------------
BUSINESS LINES
--------------------------------------------------

GET    /api/w/{wardId}/meetings/{meetingId}/business-lines
POST   /api/w/{wardId}/meetings/{meetingId}/business-lines
PUT    /api/w/{wardId}/business-lines/{id}

Status transitions allowed only by RBAC roles.

--------------------------------------------------
CALLINGS
--------------------------------------------------

GET  /api/w/{wardId}/callings
POST /api/w/{wardId}/callings
POST /api/w/{wardId}/callings/{id}/extend
POST /api/w/{wardId}/callings/{id}/sustain
POST /api/w/{wardId}/callings/{id}/set-apart

Sustain action auto-creates business line entry.

--------------------------------------------------
ANNOUNCEMENTS
--------------------------------------------------

GET    /api/w/{wardId}/announcements
POST   /api/w/{wardId}/announcements
PUT    /api/w/{wardId}/announcements/{id}
DELETE /api/w/{wardId}/announcements/{id}

--------------------------------------------------
CALENDAR
--------------------------------------------------

GET  /api/w/{wardId}/calendar
POST /api/w/{wardId}/calendar/refresh

--------------------------------------------------
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

--------------------------------------------------
USERS (WARD ADMIN)
--------------------------------------------------

GET  /api/w/{wardId}/users
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
GET  /api/support/access-requests
PUT  /api/support/oauth

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
FAILURE RULE
====================================================================

If any route:
- Accepts ward_id publicly
- Bypasses RBAC
- Returns cross-ward data
- Skips audit logging

It must be corrected immediately.

====================================================================
END OF API.md
====================================================================
