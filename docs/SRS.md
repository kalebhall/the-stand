
THE STAND
v1 System Requirements Specification

================================
1. INTRODUCTION
================================

The Stand is a web-based, ward-scoped application designed to assist local Church leaders
in preparing, conducting, and recording sacrament meetings. It supplements—but does not
replace—official Church systems such as LCR and Member Tools.

The Stand focuses on Sunday execution: what is said at the pulpit, what appears on the
program, what actions were taken, and what follow-up is required.

The Stand is not an official product of The Church of Jesus Christ of Latter-day Saints.

Primary users include bishopric members, ward clerks, membership clerks, and ward
administrators. Secondary users include conducting officers (view-only). Public users
include members and visitors accessing public sacrament programs.

Supported platforms include modern web browsers, iPad browsers for pulpit use,
printable HTML, and mobile-friendly public views.

================================
2. CORE CONCEPTS AND TERMINOLOGY
================================

All data is ward-scoped and isolated.

A Meeting is a dated Church meeting (sacrament, fast & testimony, ward conference,
stake conference, or general conference).

A Program is the ordered structure of a meeting including hymns, prayers, speakers,
music, announcements, and business.

Business Lines represent sustainings and releases conducted during sacrament meeting.

Calling Actions track proposed, extended, sustained, and set apart callings.

At the Stand is a screen-only conducting view with formal or compact guidance.

Public Programs are read-only published programs accessible via QR code or public link.

================================
3. FUNCTIONAL REQUIREMENTS
================================

Authentication uses Google login by default with ward-scoped roles and permissions.

Meetings can be created from templates, edited in draft, published as immutable
snapshots, and retained with full history.

At the Stand supports Formal Script and Compact Labels modes with ward-editable
templates and visitor-friendly default language.

Business items may auto-populate from calling actions and are confirmed at meeting
completion, triggering notifications.

Public Programs render from published snapshots only and may be accessed via stable
ward QR codes.

Notifications support bishopric actions and clerk LCR reminders with retry and
diagnostics support.

================================
4. NON-FUNCTIONAL REQUIREMENTS
================================

Security:
- Row Level Security enforced on all ward data
- Token-based public access
- Full audit logging

Privacy:
- Minimal data storage
- No addresses
- Restricted member notes
- Public views contain only safe data

Performance:
- At-the-Stand view loads in under 2 seconds
- Publishing completes in under 3 seconds

Accessibility:
- Tablet-friendly
- No color-only cues
- Clear, visitor-friendly language

================================
5. DATA MODEL (LOGICAL)
================================

Core entities include:
Ward, User, Role, Permission, Meeting, Program Item, Hymns (snapshots),
Business Lines, Program Renders, Members (non-authoritative),
Member Notes, Calling Assignments and Actions, Set Apart Records,
Announcements, Calendar Feeds and Cache, Imports, Event Outbox, Notifications.

All ward data is protected by Row Level Security.

================================
6. SECURITY MODEL
================================

Authorization is enforced through RBAC, API permission checks, and RLS.

Support Admins must explicitly enter ward context. All support access is audited.

Public endpoints use unguessable tokens and never expose ward identifiers.

================================
7. API OVERVIEW
================================

Authenticated API endpoints use:
/api/w/{ward_id}/...

Public endpoints use:
/p/{meeting_token}
/p/ward/{portal_token}

The API supports meetings, programs, business lines, callings,
imports, notifications, diagnostics, and public program management.

================================
8. USER INTERFACE FLOWS
================================

Users can manage meetings, programs, and publishing.

At the Stand provides a live conducting experience.

Meeting completion confirms actions and triggers notifications.

Imports follow a guided wizard.

Public users access read-only programs.

================================
9. MIGRATION AND DEPLOYMENT
================================

All schema changes are applied via forward-only migrations.

Seed data includes roles, permissions, templates, and settings.

Separate dev, test, and production environments are required.

================================
10. OUT OF SCOPE (V1)
================================

Out of scope:
- Direct LCR or Member Tools integration
- Financial data
- Member self-service
- Native mobile apps
- Stake-level aggregation

================================
11. SUPPORT ADMIN BOOTSTRAP
================================

On first application startup:

1. If no user exists with global role SUPPORT_ADMIN:
   - The system generates a cryptographically secure random password (minimum 24 characters).
   - The system creates a Support Admin user using SUPPORT_ADMIN_EMAIL (environment variable).
   - The generated password is printed ONE TIME to application startup logs.
   - The password is never stored in plaintext.
   - The user record is created with:
        must_change_password = true

2. On first successful login:
   - The Support Admin is forced to change password.
   - Access to the application is blocked until password change is complete.

3. After password change:
   - must_change_password = false
   - last_password_change_at is recorded.

Security Notes:
- Random password must use a cryptographically secure generator.
- Password must be hashed using Argon2id (preferred) or bcrypt.
- Generated password must never be re-displayed after startup.
- Password login endpoints must be rate-limited.

================================
12. CORE SYSTEM SUMMARY
================================

Includes:
- Landing page
- Login / Logout
- Request Access
- Dashboard
- Support Admin Console
- Stake/Ward provisioning
- OAuth configuration via UI
- Ward Admin user access management
- Meetings, Stand view, Business workflow
- Public QR portal
- Imports, Announcements, Calendar
- Full RBAC + RLS enforcement

================================
END OF DOCUMENT
================================
