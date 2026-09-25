# UI localization audit

Generated inventory of likely user-facing JSX literals. This is intentionally conservative: it includes candidates that require review and may include code-generated values.

Candidate matches: **967** across **113** files.

## Implemented in this pass

- Authenticated navigation shell and accessible navigation labels.
- Login page and credential form labels/actions.
- Settings and ward language configuration labels.
- Account overview.
- Program Designer landing page.
- User manual.
- Notification center, filters, relative times, errors, and accessible actions.
- Support hymn catalog administration.
- Recursive message-key parity regression test.

## Remaining candidate files

- `app/programs/[meetingId]/program-designer-client.tsx` — 68 candidate strings
- `app/support/users/UserAdminManager.tsx` — 59 candidate strings
- `app/announcements/announcements-workspace-client.tsx` — 52 candidate strings
- `app/support/audit-log/AuditLogViewer.tsx` — 40 candidate strings
- `app/settings/audit-log/WardAuditLogClient.tsx` — 39 candidate strings
- `app/stand/[meetingId]/offline/offline-stand-page.tsx` — 36 candidate strings
- `app/support/provisioning/StakeWardManager.tsx` — 36 candidate strings
- `components/MembershipOrdinanceSection.tsx` — 31 candidate strings
- `app/membership-ordinances/page.tsx` — 28 candidate strings
- `app/settings/stand-script/page.tsx` — 23 candidate strings
- `app/bishopric/bishopric-workspace-client.tsx` — 22 candidate strings
- `app/callings/page.tsx` — 22 candidate strings
- `app/reports/notes/page.tsx` — 22 candidate strings
- `components/reports/report-view.tsx` — 22 candidate strings
- `app/programs/templates/admin/template-admin-client.tsx` — 21 candidate strings
- `app/settings/notifications/notification-subscription-settings.tsx` — 20 candidate strings
- `app/members/members-manager-client.tsx` — 18 candidate strings
- `app/interviews/interviews-client.tsx` — 14 candidate strings
- `app/imports/sacrament-planner/sacrament-planner-import-client.tsx` — 13 candidate strings
- `app/notifications/notification-center.tsx` — 13 candidate strings
- `app/stand/[meetingId]/page.tsx` — 13 candidate strings
- `app/meetings/meeting-form.tsx` — 12 candidate strings
- `app/programs/templates/template-gallery-client.tsx` — 11 candidate strings
- `app/settings/public-layout/public-layout-client.tsx` — 11 candidate strings
- `app/support/hymns/page.tsx` — 10 candidate strings
- `components/app-shell.tsx` — 10 candidate strings
- `app/imports/page.tsx` — 9 candidate strings
- `app/request-access/request-access-form.tsx` — 9 candidate strings
- `app/settings/public-portal/page.tsx` — 9 candidate strings
- `app/speakers/speaker-lifecycle-workspace.tsx` — 9 candidate strings
- `app/support/access-requests/page.tsx` — 9 candidate strings
- `app/support/queue/queue-client.tsx` — 9 candidate strings
- `components/StandardCallingsManager.tsx` — 9 candidate strings
- `components/WardBusinessSection.tsx` — 9 candidate strings
- `app/imports/callings/calling-import-client.tsx` — 7 candidate strings
- `app/imports/members/member-import-client.tsx` — 7 candidate strings
- `app/notifications/diagnostics/page.tsx` — 7 candidate strings
- `components/dashboard/dashboard-grid.tsx` — 7 candidate strings
- `components/lcr-extractor-instructions.tsx` — 7 candidate strings
- `components/site-logo.tsx` — 7 candidate strings
- `app/page.tsx` — 6 candidate strings
- `app/programs/templates/[templateId]/template-detail-client.tsx` — 6 candidate strings
- `app/settings/health/page.tsx` — 6 candidate strings
- `components/AddCallingForm.tsx` — 6 candidate strings
- `components/InternalNotesPanel.tsx` — 6 candidate strings
- `app/login/login-form.tsx` — 5 candidate strings
- `app/manual/page.tsx` — 5 candidate strings
- `app/settings/notification-timezone.tsx` — 5 candidate strings
- `app/technology/technology-client.tsx` — 5 candidate strings
- `app/interviews/page.tsx` — 4 candidate strings
- `app/programs/programs-client.tsx` — 4 candidate strings
- `app/settings/users/page.tsx` — 4 candidate strings
- `app/settings/users/ward-users-manager.tsx` — 4 candidate strings
- `app/support/page.tsx` — 4 candidate strings
- `app/technology/page.tsx` — 4 candidate strings
- `app/account/change-password/change-password-form.tsx` — 3 candidate strings
- `app/bishopric/page.tsx` — 3 candidate strings
- `app/callings/standard/page.tsx` — 3 candidate strings
- `app/global-error.tsx` — 3 candidate strings
- `app/logout/logout-form.tsx` — 3 candidate strings
- `app/meetings/page.tsx` — 3 candidate strings
- `app/not-found.tsx` — 3 candidate strings
- `app/programs/templates/admin/page.tsx` — 3 candidate strings
- `app/programs/templates/page.tsx` — 3 candidate strings
- `app/settings/language-preference.tsx` — 3 candidate strings
- `app/settings/notifications/page.tsx` — 3 candidate strings
- `app/settings/public-layout/page.tsx` — 3 candidate strings
- `components/deployment-watcher.tsx` — 3 candidate strings
- `components/offline-stand-button.tsx` — 3 candidate strings
- `app/account/change-password/page.tsx` — 2 candidate strings
- `app/announcements/error.tsx` — 2 candidate strings
- `app/callings/error.tsx` — 2 candidate strings
- `app/dashboard/error.tsx` — 2 candidate strings
- `app/imports/callings/page.tsx` — 2 candidate strings
- `app/imports/error.tsx` — 2 candidate strings
- `app/imports/members/page.tsx` — 2 candidate strings
- `app/imports/sacrament-planner/page.tsx` — 2 candidate strings
- `app/meetings/delete-meeting-button.tsx` — 2 candidate strings
- `app/meetings/new/page.tsx` — 2 candidate strings
- `app/members/page.tsx` — 2 candidate strings
- `app/notifications/error.tsx` — 2 candidate strings
- `app/notifications/page.tsx` — 2 candidate strings
- `app/reports/page.tsx` — 2 candidate strings
- `app/request-access/page.tsx` — 2 candidate strings
- `app/sentry-example-page/page.tsx` — 2 candidate strings
- `app/settings/audit-log/page.tsx` — 2 candidate strings
- `app/settings/module-settings.tsx` — 2 candidate strings
- `app/settings/public-portal/error.tsx` — 2 candidate strings
- `app/settings/stand-script/error.tsx` — 2 candidate strings
- `app/settings/users/error.tsx` — 2 candidate strings
- `app/speakers/page.tsx` — 2 candidate strings
- `app/support/audit-log/page.tsx` — 2 candidate strings
- `app/support/provisioning/page.tsx` — 2 candidate strings
- `app/support/queue/page.tsx` — 2 candidate strings
- `app/support/users/page.tsx` — 2 candidate strings
- `components/notification-bell.tsx` — 2 candidate strings
- `app/account/page.tsx` — 1 candidate strings
- `app/announcements/loading.tsx` — 1 candidate strings
- `app/callings/loading.tsx` — 1 candidate strings
- `app/dashboard/loading.tsx` — 1 candidate strings
- `app/imports/loading.tsx` — 1 candidate strings
- `app/logout/page.tsx` — 1 candidate strings
- `app/meetings/[meetingId]/edit/page.tsx` — 1 candidate strings
- `app/meetings/[meetingId]/print/page.tsx` — 1 candidate strings
- `app/meetings/error.tsx` — 1 candidate strings
- `app/notifications/loading.tsx` — 1 candidate strings
- `app/settings/public-portal/loading.tsx` — 1 candidate strings
- `app/settings/stand-script/loading.tsx` — 1 candidate strings
- `app/settings/users/loading.tsx` — 1 candidate strings
- `components/HymnAutocomplete.tsx` — 1 candidate strings
- `components/public-portal/PublicLinkQrCard.tsx` — 1 candidate strings
- `components/ui/button.tsx` — 1 candidate strings
- `components/ui/member-autocomplete.tsx` — 1 candidate strings

## Completion rule

This audit is not complete until every remaining candidate is either moved to a message key or documented as a deliberate non-translatable value (for example, a Church hymn title, role code, database status, or user-entered content).
