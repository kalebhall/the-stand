
# UI.md — The Stand (Master User Interface Specification)

This document defines the complete user interface structure, page behavior,
role-based visibility rules, state transitions, layout expectations, and
interaction contracts for The Stand.

It is the authoritative UI reference for implementation.

====================================================================
GLOBAL UI PRINCIPLES
====================================================================

1. Tablet-friendly (especially At-the-Stand view).
2. Clean, minimal, modern design (Tailwind + shadcn/ui).
3. No Church-internal jargon on public-facing screens.
4. Role-aware navigation.
5. All destructive actions require confirmation.
6. All mutations show success/error feedback.
7. No cross-ward data exposure in UI.
8. Public pages contain only Level 0 (safe) data.

====================================================================
PUBLIC PAGES (NO AUTH REQUIRED)
====================================================================

--------------------------------------------------
/  (Landing Page)
--------------------------------------------------

Purpose:
Introduce The Stand and allow login or access request.

Sections:
- Hero section (clear mission statement)
- Feature summary cards
- Security summary (ward isolation, no LCR integration)
- Call to action buttons:
  - Log In
  - Request Access

Footer:
- Version
- Contact/support email (optional)

--------------------------------------------------
/login
--------------------------------------------------

Features:
- Google OAuth button (primary)
- Email/password form (if enabled)
- Forgot password link (if enabled)
- Error messaging (non-revealing)

State:
- On success → redirect to /dashboard
- If must_change_password = true → redirect to /account/change-password

--------------------------------------------------
/request-access
--------------------------------------------------

Form Fields:
- Name
- Email
- Stake
- Ward
- Message

Behavior:
- Submit → show confirmation state
- Rate limited
- Honeypot field optional for spam protection

--------------------------------------------------
/logout
--------------------------------------------------

Behavior:
- Ends session
- Displays confirmation
- Redirect option to home

====================================================================
AUTHENTICATED SHELL
====================================================================

Layout:
- Top navigation bar
- Ward switcher (if user belongs to multiple wards)
- Role-based nav items
- Profile dropdown (account, logout)

Navigation Visibility:

All authenticated users:
- Dashboard
- Meetings

Bishopric/Clerk roles:
- Callings
- Announcements
- Imports

Ward Admin:
- Settings (Users)
- Templates (future extension)
- Public Portal settings

Support Admin:
- Support Console

====================================================================
/dashboard
====================================================================

Cards (role aware):

1. Next Meeting
   - Date
   - Quick links: Edit / Stand / Print

2. Draft Meetings Count

3. Set Apart Queue Count

4. Notification Health
   - Last delivery time
   - Failed deliveries indicator

5. Last Import Summary

6. Public Portal Status (Admin only)

Empty State:
- If no meetings exist, show “Create First Meeting” CTA.

====================================================================
MEETINGS MODULE
====================================================================

--------------------------------------------------
/meetings
--------------------------------------------------

Displays:
- Upcoming meetings
- Past meetings (history)
- Status badge (Draft / Published / Completed)

Actions:
- Create Meeting
- Edit
- Publish
- Stand
- Print
- Complete

--------------------------------------------------
/meetings/{meetingId}/edit
--------------------------------------------------

Sections:

1. Meeting Info
   - Date
   - Type

2. Hymns
   - Number input
   - Title auto-filled (snapshot stored)

3. Program Items
   - Drag-and-drop ordering
   - Add item
   - Remove item

4. Business Lines
   - Sustain/Release entries
   - Status dropdown

5. Announcements (optional attach)

Actions:
- Save Draft
- Publish

Publish Confirmation Modal:
- Warn immutable snapshot will be created.

--------------------------------------------------
/meetings/{meetingId}/print
--------------------------------------------------

- Print-optimized layout
- Omits unused sections
- Matches official Church layout structure
- Includes sacrament prayers if configured

====================================================================
AT THE STAND VIEW
====================================================================

--------------------------------------------------
/stand/{meetingId}
--------------------------------------------------

Modes toggle:
- Formal Script
- Compact Labels

Formal Script Mode:
- Full phrasing
- Visitor-friendly welcome:
  “Welcome to The Church of Jesus Christ of Latter-day Saints.”
- Sustain/release phrasing:
  - Member name bold
  - Calling name bold

Compact Mode:
- Section labels only
- Names and callings listed without full script

Design Requirements:
- Large typography
- Minimal scrolling
- Dark mode optional
- Must load quickly (<2 seconds target)

====================================================================
CALLINGS MODULE
====================================================================

--------------------------------------------------
/callings
--------------------------------------------------

Displays:
- Active callings
- Status column (Proposed, Extended, Sustained, Set Apart)
- Actions per row depending on status

Buttons:
- Extend
- Sustain
- Mark Set Apart

Sustain Action:
- Confirmation modal
- Auto-add business line

Set Apart Action:
- Confirmation modal
- Trigger clerk notification

====================================================================
ANNOUNCEMENTS MODULE
====================================================================

--------------------------------------------------
/announcements
--------------------------------------------------

Fields:
- Title
- Body
- Start date
- End date
- Permanent checkbox
- Placement selector

List View:
- Active
- Upcoming
- Expired

====================================================================
IMPORTS MODULE
====================================================================

--------------------------------------------------
/imports
--------------------------------------------------

Tabs:
- Membership
- Callings

Paste Box:
- Plain-text enforced
- Strip HTML artifacts

Workflow:
1. Paste
2. Parse preview
3. Conflict resolution screen
4. Confirm commit
5. Success summary

Raw text auto-purged after retention window.

====================================================================
SETTINGS
====================================================================

--------------------------------------------------
/settings/users (Ward Admin)
--------------------------------------------------

Displays:
- Users in ward
- Roles per user

Actions:
- Assign role
- Remove role
- Disable ward access

Changes must show confirmation and log audit entry.

--------------------------------------------------
/account
--------------------------------------------------

Displays:
- Profile info
- Change password (if not Google-only)

--------------------------------------------------
/account/change-password
--------------------------------------------------

Forced on bootstrap admin first login.
Cannot navigate away until changed.

====================================================================
SUPPORT CONSOLE
====================================================================

--------------------------------------------------
/support
--------------------------------------------------

Sections:
- Create Stake
- Create Ward
- Assign Ward Admin
- View Access Requests
- Configure OAuth

OAuth Config UI:
- Mask client secret
- Save encrypted
- Audit change

Only SUPPORT_ADMIN can access.

====================================================================
ERROR STATES
====================================================================

403 Forbidden:
- Show permission message.
- No internal details.

404 Not Found:
- Generic message.

500 Error:
- Generic error screen.
- Logged server-side.

====================================================================
LOADING & FEEDBACK
====================================================================

- All async actions show spinner.
- Toast notifications for success/failure.
- Publish and Complete actions show blocking confirmation.

====================================================================
ACCESSIBILITY
====================================================================

- Semantic HTML
- Proper button roles
- Keyboard navigation
- Contrast compliant
- Responsive layout

====================================================================
FAILURE RULE
====================================================================

If UI exposes:
- Cross-ward data
- Internal IDs publicly
- Unpublished meeting data
- Secrets or tokens
- Role escalation options

Stop and correct before proceeding.

====================================================================
END OF UI.md
====================================================================
