
# ACCEPTANCE.md — The Stand (Master Acceptance Test Specification)

This document defines formal executable-style acceptance criteria
for The Stand using Given / When / Then format.

All scenarios must pass before release candidate approval.

====================================================================
SECTION 1 — SYSTEM BOOTSTRAP
====================================================================

Scenario: Support Admin bootstrap user is created on first startup
Given the system has no users
When the application starts
Then a SUPPORT_ADMIN account is created
And a cryptographically secure random password (≥24 characters) is generated
And the password is printed once to logs
And must_change_password is set to true

Scenario: Bootstrap admin must rotate password on first login
Given a SUPPORT_ADMIN with must_change_password = true
When the user logs in
Then the user is redirected to /account/change-password
And all other navigation is blocked
When the password is successfully changed
Then must_change_password becomes false
And last_password_change_at is recorded

====================================================================
SECTION 2 — AUTHENTICATION
====================================================================

Scenario: Google login succeeds
Given a valid Google OAuth configuration
When a user authenticates via Google
Then a session is created
And /dashboard is displayed

Scenario: Password login is rate limited
Given repeated failed password attempts
When login attempts exceed configured threshold
Then further attempts are temporarily blocked

====================================================================
SECTION 3 — WARD ISOLATION
====================================================================

Scenario: User cannot access another ward’s data
Given User A belongs to Ward 1
And Ward 2 exists
When User A attempts to access Ward 2 meetings via API
Then the request is denied (403 or empty result)
And no Ward 2 data is returned

Scenario: RLS blocks cross-ward queries
Given RLS is enabled
When a query attempts to select meeting rows from another ward
Then PostgreSQL returns no rows

====================================================================
SECTION 4 — ROLE ENFORCEMENT
====================================================================

Scenario: Ward Admin assigns ward role
Given a user with STAND_ADMIN role
When they assign BISHOPRIC_EDITOR to another user
Then the role is stored in ward_user_role
And an audit_log entry is created

Scenario: Ward user cannot assign global role
Given a STAND_ADMIN
When they attempt to assign SUPPORT_ADMIN
Then the action is denied

====================================================================
SECTION 5 — MEETINGS
====================================================================

Scenario: Meeting creation
Given a STAND_ADMIN
When they create a meeting
Then a meeting record exists in status DRAFT

Scenario: Publish meeting creates immutable snapshot
Given a DRAFT meeting
When publish is triggered
Then meeting status becomes PUBLISHED
And a meeting_program_render record is created
And render version increments

Scenario: Republish creates new version
Given a PUBLISHED meeting
When republish is triggered
Then a new version is created
And previous versions remain unchanged

Scenario: Complete meeting processes business lines
Given a meeting with business lines marked ANNOUNCED
When complete is triggered
Then outbox events are created
And meeting status becomes COMPLETED

====================================================================
SECTION 6 — AT THE STAND VIEW
====================================================================

Scenario: Stand view loads correctly
Given a published meeting
When visiting /stand/{meetingId}
Then meeting content is displayed
And sustain/release names are bolded
And calling names are bolded

Scenario: Compact mode toggle works
Given Stand view is loaded
When user toggles Compact mode
Then full script text is replaced by section labels

====================================================================
SECTION 7 — CALLINGS WORKFLOW
====================================================================

Scenario: Sustain action auto-creates business line
Given a calling in EXTENDED state
When sustain is triggered
Then calling status becomes SUSTAINED
And a meeting_business_line entry is created

Scenario: Set apart triggers clerk notification
Given a calling in SUSTAINED state
When set apart is marked
Then calling status becomes SET_APART
And a notification event is created
And notification includes LCR reminder instruction

====================================================================
SECTION 8 — PUBLIC PROGRAM
====================================================================

Scenario: Public meeting token displays only published content
Given a published meeting
When visiting /p/{meetingToken}
Then snapshot HTML is returned
And no internal identifiers are exposed

Scenario: Stable ward portal resolves latest meeting
Given a ward with portal token
When accessing /p/ward/{portalToken}
Then latest published meeting is displayed

Scenario: Unpublished meeting cannot be accessed publicly
Given a DRAFT meeting
When using its token
Then access is denied

====================================================================
SECTION 9 — IMPORTS
====================================================================

Scenario: Membership import dry run
Given raw membership text
When submitted without commit flag
Then parsed preview is returned
And no DB changes occur

Scenario: Membership import commit
Given validated preview
When commit flag is true
Then member records are inserted/updated

Scenario: Raw paste purged after retention window
Given import older than retention threshold
When purge job runs
Then raw paste text is deleted

====================================================================
SECTION 10 — ANNOUNCEMENTS & CALENDAR
====================================================================

Scenario: Calendar refresh
Given valid ICS feed
When refresh endpoint is triggered
Then calendar events are parsed and stored

Scenario: Permanent announcement displays regardless of date
Given announcement is marked permanent
When viewing meeting
Then announcement appears even outside date window

====================================================================
SECTION 11 — NOTIFICATIONS
====================================================================

Scenario: Outbox event processed
Given event_outbox record exists
When worker runs
Then notification_delivery record is created
And processed flag becomes true

Scenario: Failed notification retries
Given failed delivery
When retry logic executes
Then attempts increment
And success recorded when delivered

====================================================================
SECTION 12 — AUDIT LOGGING
====================================================================

Scenario: Role change is logged
Given role assignment
When completed
Then audit_log contains entry with ward_id and user_id

Scenario: Meeting publish is logged
Given publish action
When executed
Then audit_log contains publish event

====================================================================
SECTION 13 — HEALTH & DEPLOYMENT
====================================================================

Scenario: Health endpoint
When GET /health is called
Then response includes status "ok"
And database connectivity confirmed

Scenario: Backup restore integrity
Given a backup file
When restored to test DB
Then user login works
And meeting history remains intact

====================================================================
SECTION 14 — FAILURE CONDITIONS
====================================================================

The build must be rejected if:

- Cross-ward data exposure occurs
- RLS is disabled on ward tables
- Bootstrap password stored in plaintext
- Public routes expose internal IDs
- Role escalation beyond defined scope is possible
- Audit logging missing for admin actions

====================================================================
END OF ACCEPTANCE.md
====================================================================
