
# PERMISSIONS.md — The Stand (Master Role & Authorization Specification)

This document defines the complete role model, permission model,
authorization rules, enforcement strategy, and escalation boundaries
for The Stand.

This file is authoritative for RBAC implementation.

====================================================================
CORE AUTHORIZATION PRINCIPLES
====================================================================

1. Defense in Depth:
   - Layer 1: Route-level RBAC enforcement
   - Layer 2: Ward context validation
   - Layer 3: PostgreSQL Row Level Security (RLS)

2. Least Privilege:
   - Users receive only the minimum permissions required.

3. Ward Isolation:
   - No user may access data from a ward in which they do not have a role.
   - Even SUPPORT_ADMIN does not bypass ward RLS for ward data queries.
   - Support Admin actions operate through provisioning APIs, not direct ward data access.

4. Audit Everything:
   - All permission changes must insert into audit_log.
   - All support/admin actions must be logged.

====================================================================
ROLE SCOPES
====================================================================

There are two role scopes:

GLOBAL ROLES
- SUPPORT_ADMIN
- SYSTEM_ADMIN

WARD ROLES
- STAND_ADMIN
- BISHOPRIC_EDITOR
- CLERK_EDITOR
- WARD_CLERK
- MEMBERSHIP_CLERK
- CONDUCTOR_VIEW

GLOBAL roles apply across the entire system.
WARD roles apply only within a specific ward.

====================================================================
GLOBAL ROLES
====================================================================

--------------------------------------------------
SUPPORT_ADMIN
--------------------------------------------------

Purpose:
System-level administrator for provisioning and configuration.

Capabilities:
- Create stake
- Create ward
- Assign ward admin (STAND_ADMIN)
- Configure Google OAuth credentials
- View and process access requests
- Access Support Console UI

Restrictions:
- Cannot bypass ward RLS.
- Cannot view ward meeting content unless explicitly assigned ward role.
- Cannot impersonate users.

--------------------------------------------------
SYSTEM_ADMIN (Optional Future Role)
--------------------------------------------------

Purpose:
Reserved for infrastructure-level operations.

Capabilities:
- May access system metrics
- May access diagnostics

Restrictions:
- No implicit ward access
- Must still respect RLS

====================================================================
WARD ROLES
====================================================================

--------------------------------------------------
STAND_ADMIN (Ward Admin)
--------------------------------------------------

Purpose:
Primary ward-level administrator.

Permissions:

User Management:
- View ward users
- Assign ward roles
- Revoke ward roles
- Disable ward access

Meeting Management:
- Create meeting
- Edit meeting
- Publish meeting
- Complete meeting

Callings:
- Full lifecycle control (propose, extend, sustain, set apart)

Announcements:
- Create/update/delete

Imports:
- Run membership import
- Run callings import

Public Portal:
- Rotate portal token
- Enable/disable portal

Restrictions:
- Cannot modify other wards
- Cannot assign GLOBAL roles

--------------------------------------------------
BISHOPRIC_EDITOR
--------------------------------------------------

Purpose:
Conducting and meeting preparation role.

Permissions:
- Create/edit meetings
- Add hymns
- Add program items
- Add business lines
- Publish meeting
- Complete meeting
- Manage callings lifecycle

Restrictions:
- Cannot manage users
- Cannot modify OAuth config
- Cannot manage ward settings

--------------------------------------------------
CLERK_EDITOR
--------------------------------------------------

Purpose:
Administrative support role.

Permissions:
- View meetings
- Add/edit announcements
- View callings
- Mark set apart
- View import history

Restrictions:
- Cannot publish meeting
- Cannot manage users

--------------------------------------------------
WARD_CLERK
--------------------------------------------------

Purpose:
Receives reminders to update LCR.

Permissions:
- View meetings
- View callings
- View set apart queue
- Receive notifications

Restrictions:
- No editing rights

--------------------------------------------------
MEMBERSHIP_CLERK
--------------------------------------------------

Purpose:
Membership data oversight.

Permissions:
- View callings
- View member notes
- Receive set apart reminders

Restrictions:
- No meeting editing

--------------------------------------------------
CONDUCTOR_VIEW
--------------------------------------------------

Purpose:
Read-only Stand view access.

Permissions:
- View dashboard
- View meetings
- Access /stand/{meetingId}

Restrictions:
- No editing rights

====================================================================
PERMISSION MATRIX (SUMMARY)
====================================================================

Capability                          | Support | Ward Admin | Bishopric | Clerk Editor | Clerk | Conductor
-----------------------------------------------------------------------------------------------------------
Create Stake/Ward                   |   Yes   |    No      |    No     |     No       | No    | No
Assign Ward Roles                   |   Yes*  |    Yes     |    No     |     No       | No    | No
Create/Edit Meeting                 |   No    |    Yes     |    Yes    |     No       | No    | No
Publish Meeting                     |   No    |    Yes     |    Yes    |     No       | No    | No
Complete Meeting                    |   No    |    Yes     |    Yes    |     No       | No    | No
Callings Lifecycle                  |   No    |    Yes     |    Yes    |     Limited  | View  | No
Announcements CRUD                  |   No    |    Yes     |    Yes    |     Yes      | No    | No
Imports                             |   No    |    Yes     |    Limited|     Yes      | No    | No
Access Stand View                   |   No    |    Yes     |    Yes    |     Yes      | Yes   | Yes
Rotate Public Portal Token          |   No    |    Yes     |    No     |     No       | No    | No

*Support Admin assigns STAND_ADMIN only; further roles handled at ward level.

====================================================================
ENFORCEMENT STRATEGY
====================================================================

1. API Layer:
   - Every ward route validates:
       requireAuth()
       requireWardAccess(wardId)
       requirePermission(permission)

2. Session Context:
   - Must include active ward_id
   - Must include user_id

3. Database Layer:
   - RLS ensures ward isolation even if API misconfigured

4. UI Layer:
   - Hide navigation items not permitted
   - Never rely solely on UI for security

====================================================================
WARD CONTEXT RULES
====================================================================

- User may belong to multiple wards.
- Active ward selected via session.
- Switching wards updates session context.
- All queries scoped to active ward.

====================================================================
ROLE ASSIGNMENT RULES
====================================================================

- Only STAND_ADMIN may assign ward roles.
- Only SUPPORT_ADMIN may assign STAND_ADMIN.
- No user may assign a role equal to or higher than their own scope.
- Role changes must write to audit_log.

====================================================================
ESCALATION PROHIBITIONS
====================================================================

The system must prevent:

- Assigning GLOBAL roles from ward UI
- Cross-ward role assignment
- Role assignment via direct DB manipulation
- UI-level privilege escalation through hidden routes

====================================================================
AUDIT REQUIREMENTS
====================================================================

Must log:
- Role assignment
- Role revocation
- Ward creation
- Stake creation
- OAuth config change
- Meeting publish
- Meeting completion
- Calling lifecycle transitions

Audit fields:
- ward_id (nullable for global actions)
- user_id
- action
- details JSON
- timestamp

====================================================================
FAILURE RULE
====================================================================

If any implementation allows:

- Cross-ward data access
- Role escalation beyond defined hierarchy
- Global role assignment from ward context
- Bypassing RLS
- Skipping audit logging

Development must stop and the design corrected.

====================================================================
END OF PERMISSIONS.md
====================================================================
