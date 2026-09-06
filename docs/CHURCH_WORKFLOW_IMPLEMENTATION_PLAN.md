# Church Workflow and Public Program Implementation Plan

> **For Hermes:** Execute in phases. Each phase is a coherent vertical slice. Verify before moving to the next phase.

**Goal:** Close the highest-value Church workflow, privacy, operational, and public-program gaps without turning The Stand into a replacement for LCR or Member Tools.

**Architecture:** Keep The Stand as a ward-scoped planning, coordination, conducting, print, and public-program layer. Keep official membership, ordinance, attendance, and record completion in Church systems. Reuse existing church-action, meeting, audit, offline, and rendering infrastructure where it fits; do not force unrelated workflows into ordinary sacrament-program items.

**Important domain rule:** Confirmation is associated with the baptism workflow. It does **not** belong in sacrament-meeting program business. The Stand may track preparation/follow-up for a baptism and confirmation, but must not imply that confirmation occurs during sacrament meeting.

**Tech stack:** Next.js, TypeScript, PostgreSQL/Drizzle, Vitest, existing public/print/At-the-Stand renderers, IndexedDB offline storage, GitHub PR workflow.

---

## Delivery rules

1. Do not edit applied migrations. Add forward migrations.
2. Trace every change through schema, API, editor, print, public, At-the-Stand, offline, dashboard, audit, and tests as applicable.
3. Keep public content separate from private leadership content.
4. Preserve ward-scoped authorization on every read and write.
5. Official Church systems remain authoritative for membership, ordinances, and attendance.[3][7]
6. Use Handbook links beside policy-sensitive prompts. Mark editable text as a ward prompt, not official wording.[1][2]
7. Run after each phase:

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test
npm run typecheck
npm run build
git diff --check
```

8. Commit each phase separately. Continue on current feature PR only while it remains open. If PR merges, branch from current `origin/main`.

---

# Phase 0 — Privacy, retention, and recovery

## Option 0A: Protect offline private data

**Priority:** P0

**Outcome:** Offline snapshots and private notes fail closed when authorization changes and can be removed by the user.

**Files likely involved:**

- `apps/web/src/offline/storage.ts`
- offline snapshot and sync routes
- offline At-the-Stand page/components
- authentication/session refresh helpers
- new migration only if server-side device/session metadata is needed
- focused offline tests

**Tasks:**

1. Document threat model and classify offline fields as public meeting content, conducting content, private notes, or sensitive follow-up.
2. Minimize snapshot payload to fields needed for conducting and explicitly approved read-only reference data.
3. Add Web Crypto encryption for private offline fields, with key invalidation on logout, user change, ward change, expired session, or authorization refresh failure.
4. Add “Delete offline data” control and confirmation.
5. Add visible warning that device contains private ward data.
6. Ensure generic service-worker caches never contain private API responses.
7. Add tests for user switch, ward switch, logout, failed decryption, expired authorization, offline reload, and delete control.

**Acceptance:** Unauthorized or undecryptable local data is not rendered. Public meeting content can still be used offline only when explicitly permitted.

## Option 0B: Retention and purge scheduler

**Priority:** P0

**Outcome:** Existing raw-import purge becomes an operating control, not unused code.

**Files likely involved:**

- `apps/web/src/imports/purge.ts`
- scheduler/worker entrypoint
- deployment configuration
- admin health/status page
- retention documentation and tests

**Tasks:**

1. Define retention by data class: raw imports, offline mutation ledger, private notes, audit events, and browser snapshots.
2. Add scheduled purge invocation with idempotent behavior.
3. Emit structured success/failure metrics without logging private payloads.
4. Add dry-run/admin diagnostic mode.
5. Add tests proving expired data is removed and current data remains.
6. Document recovery and retention assumptions.

**Acceptance:** A scheduled job runs in deployment, reports result, and can be verified without inspecting private content.

## Option 0C: Backup restore drill

**Priority:** P0

**Outcome:** PostgreSQL backups are restorable and monitored.

**Files likely involved:**

- `infra/scripts/backup.sh`
- new `infra/scripts/restore-smoke-test.sh`
- deployment/cron/monitoring configuration
- `docs/OPERATIONS.md` or equivalent runbook

**Tasks:**

1. Add encrypted off-host backup target using deployment-provided credentials only.
2. Add isolated restore smoke test.
3. Validate schema, migration state, row counts, and a non-secret application health query after restore.
4. Add backup success/failure alerting.
5. Document RPO, RTO, restore steps, and required configuration.
6. Run one real restore drill and record result.

**Acceptance:** Restore drill produces a verified isolated database; secrets never appear in logs or committed files.

---

# Phase 1 — Official-record boundary and ordinance preparation

## Option 1A: LCR/Member Tools handoff checklist

**Priority:** P1

**Outcome:** The Stand tracks operational follow-up without copying official Church records.[3][7]

**Files likely involved:**

- `apps/web/src/db/schema.ts`
- new forward migration
- membership/ordinance domain and API routes
- `apps/web/app/membership-ordinances/page.tsx`
- meeting and dashboard surfaces
- audit event helpers

**Data shape:**

- `recordFormNeeded`
- `responsibleClerkOrLeader`
- `handoffDate`
- `officialRecordUpdatedBy`
- `certificateOrFormDelivered`
- `officialSystemFollowUpStatus`
- source/reference URL

Do not store copied ordinance details or replace LCR status.

**Tasks:** Add migration/schema, validate API transitions, add workspace controls, show pending handoff in dashboard, render read-only summary offline, audit each transition, and test ward isolation/repeated updates.

## Option 1B: Typed priesthood office

**Priority:** P1

**Outcome:** Priesthood ordination preparation uses validated office values and stays distinct from setting apart.

**Allowed values:** Deacon, Teacher, Priest, Elder, High Priest where applicable, plus temporary unknown during planning. In a ward sacrament meeting, ward workflows must not sustain or set apart Elders or High Priests; those responsibilities belong to stake leadership.

**Tasks:**

1. Add nullable typed office field through schema/API/domain/UI.
2. Reject office/action combinations that do not make sense.
3. Add fields for interview complete, approval confirmed, presenting leader, performing priesthood holder, planned ordinance date, and LCR handoff.
4. Keep setting apart outside this action family.
5. Update editor, meeting rendering, dashboard, offline read-only display, and tests.

## Option 1C: Template classification

**Priority:** P1

**Outcome:** Users can distinguish official required elements, official examples, and editable ward prompts.

**Tasks:**

1. Add template classification metadata.
2. Add source URL and source label.
3. Display editable warning for ward prompts.
4. Keep official text unchanged when exact wording is required.
5. Add tests for formal, compact, print, public, and offline output.

---

# Phase 2 — Correct membership and ordinance coverage

## Option 2A: Baptized-child recognition

**Priority:** P1

**Outcome:** Recognition of baptized children is distinct from welcoming a new member.

**Tasks:** Add `RECOGNIZE_BAPTIZED_CHILD` action, validation, editor fields, follow-up state, dashboard queue, meeting presentation rendering, print/public filtering, offline read-only display, and tests.

## Option 2B: Baptism and confirmation follow-up

**Priority:** P1

**Outcome:** Confirmation is modeled under baptism, never as sacrament-meeting business.

**Required model:**

- Baptism/confirmation preparation record
- Baptism date/status
- Confirmation date/status, if operationally needed
- Responsible leader
- Interview/approval metadata where appropriate
- LCR handoff reminder
- No default sacrament-meeting program item for confirmation

**Tasks:**

1. Audit existing confirmation strings, action types, defaults, imports, and renderers.
2. Remove or migrate any confirmation item incorrectly attached to sacrament meeting.
3. Add baptism workflow relation for confirmation follow-up.
4. Add tests proving sacrament defaults do not include confirmation.
5. Render only the meeting presentation elements that actually belong in the meeting; do not claim The Stand completes the ordinance.

## Option 2C: Church-action source and status safety

**Priority:** P1

**Outcome:** Meeting announcement, underlying action completion, interview completion, and official-record update remain separate states.[1][2][3]

**Tasks:** Centralize transition validation, block LCR completion before underlying action completion, record actor/timestamp, add invalid-order tests, and expose official-system handoff wording.

---

# Phase 3 — Meeting readiness

## Option 3A: Speaker invitation lifecycle

**Priority:** P1

**States:** `PLANNED → INVITED → ACCEPTED → CONFIRMED → COMPLETED`

**Tasks:**

1. Add speaker workflow metadata without mixing it into public text.
2. Add invitation/acceptance/confirmation controls.
3. Add reminder and missing-topic indicators.
4. Add meeting readiness summary for speakers, hymns, prayers, and required participants.
5. Update editor, dashboard, print/public output, and tests.

## Option 3B: Fast-and-testimony and special-meeting rules

**Priority:** P1

**Outcome:** Meeting type controls behavior, not only initial defaults.

**Tasks:**

1. Define allowed/forbidden item types by meeting type.
2. Hide or warn on assigned speakers and special musical selections for fast-and-testimony meetings.
3. Enforce rules at API boundary.
4. Preserve explicit exceptions for ward conference and stake/general conference.
5. Add template replacement and exact-order tests.

## Option 3C: Attendance handoff

**Priority:** P2

**Recommendation:** Start with an official-tool reminder/link, not duplicate attendance storage.

**Tasks:** Add “Record attendance in LCR/Member Tools” action, source link, optional completion reminder, and no-authoritative-record disclaimer. Reconsider local headcount only after retention/privacy review.

---

# Phase 4 — Leadership workflows

## Option 4A: Bishopric meeting workspace

**Priority:** P1

**Outcome:** Bishopric work is separate from public sacrament programs.

**Data:** Meeting date, participants, agenda template, linked actions/callings/members, decisions, assignments, due dates, owners, visibility, carry-forward, completion history.

**Tasks:** Add meeting type and protected route, agenda templates, action links, private visibility rules, assignment lifecycle, dashboard due items, and tests for ward isolation/public exclusion.

**Implementation status:** Core bishopric workspace delivered in `0045_bishopric_workspace.sql`: protected ward-scoped route, private agenda meetings, action assignments with owners/due dates/carry-forward, completion history, lifecycle validation, dashboard overdue count, and public-program exclusion. Linked member/calling/action references and broader meeting templates remain follow-up work.

## Option 4B: Ward council and missionary coordination

**Priority:** P1

**Outcome:** Lightweight coordination workflows exist without storing unnecessary confidential counseling content.[4][6]

**Tasks:** Add Ward Council and Missionary Coordination meeting types, reusable assignments, member/action links, restricted notes, carry-forward, and dashboard due items. Add Ward Youth Council only after validating need.

**Implementation status:** Coordination types now reuse protected private leadership meetings/actions. Routes `/ward-council` and `/missionary-coordination` open filtered workspaces, with private assignments, due dates, carry-forward, completion lifecycle, and dashboard overdue count. Member/action linking and restricted-note subtypes remain follow-up work; Ward Youth Council not added.

## Option 4C: Scheduled interviews

**Priority:** P1

**Outcome:** Interview scheduling tracks operational metadata without confidential interview content.[5][6]

**Data:** Interview type, member, interviewer, date, completion state, linked action/calling, private-note boundary.

**Tasks:** Add schema/API, calendar/reminder integration, permission checks, dashboard view, offline read-only reference only, and tests.

**Implementation status:** Scheduled interview records now track interview type, member, interviewer, scheduled time, linked action/calling IDs, status, and completion time. Protected `/interviews` UI, ward-scoped API, lifecycle validation, dashboard count, and private-content boundary are delivered. Calendar-feed export/reminders and offline read-only snapshot remain follow-up work.

## Option 4D: Technology/streaming checklist

**Priority:** P2

**Outcome:** Meeting technology readiness is trackable without storing credentials or network secrets.[8]

**Tasks:** Add optional meeting checklist with owner, audio/room/stream readiness, authorized link, accessibility check, start/stop confirmation, and recording deletion reminder. Keep secrets outside The Stand.

**Implementation status:** Protected `/technology` checklist now tracks owner, room/audio/stream/accessibility readiness, HTTPS authorized link, start/stop confirmation, and recording deletion reminder. Schema/API enforce ward scope and reject non-HTTPS links. Credentials and network secrets remain excluded. Dashboard shortcut, offline reference, and automatic reminders remain follow-up work.

---

# Phase 5 — Public program and printed-program designer

## Product goal

Create one source of approved meeting content that can produce:

- Public web program
- Mobile public view
- Printable program
- At-the-Stand/private conducting view

Public output must exclude private notes, leadership follow-up, interview details, LCR status, internal workflow state, and unpublished content.

## Option 5A: Layout presets

**Implementation status:** Persisted, ward-scoped layout settings now flow into print rendering and publish snapshots. Renderer applies preset data attributes, announcement mode filtering, text-first cover fallback, and fold-guide marker for bifold/tri-fold output. Public URLs serve published snapshots containing selected layout. QR output integration now emits an accessible inline SVG linking to stable `/p/{meetingToken}` public URL in published renders. Existing share token is reused on republish; new token generated only when needed. Print/published output remains text-first and QR is optional.

Offer named presets instead of forcing users to design from scratch.

### Preset 1: Single-sheet bifold

- Letter portrait, landscape fold, two panels per side
- Front cover: ward name, meeting date/type, optional image
- Inside left: welcome and opening program items
- Inside right: sacrament, speakers, musical selections, closing items
- Back: announcements, contact/website/QR code, optional closing message

Best for ordinary weeks. Folded sacrament-program examples commonly place a cover on the outside panel and meeting content/announcements across inside and back panels.[9] Lowest paper and setup complexity.

### Preset 2: Tri-fold bulletin

- Letter landscape, three panels per side
- Cover panel: ward/date/title and optional image
- Inside panels: ordered meeting program split by natural sections
- Back panel: announcements, website/QR code, ward contact, accessibility note

Best when announcements and program content both need room. Requires careful panel order and fold preview.

### Preset 3: Half-sheet two-up

- Two identical programs per letter sheet
- Double-sided, cut or folded
- Minimal cover and compact interior
- Announcements limited to selected items

Best for low-cost weekly printing. Similar approach appears in existing online sacrament-program generators that print two bulletins per sheet, double-sided.[10]

### Preset 4: Full-page bulletin

- Letter portrait, one page or multi-page
- No folding required
- Strongest accessibility and large-print option
- Best fallback when content is long or printer folding is unreliable

### Preset 5: Custom section layout

- User chooses paper size, orientation, columns/panels, cover, section placement, and announcement placement
- Only add after presets are stable
- Must retain print-safe defaults and validation

## Option 5B: Cover choices

Offer controlled cover options:

1. No image, typography only — recommended default.
2. Church-approved/local ward building image.
3. Nature/seasonal image supplied by ward.
4. Member-provided image uploaded by authorized user.
5. Custom cover text with image or color block.

Safety rules:

- Image crop and resolution preview.
- Alt text required for public web; print-only image can still have a description.
- No identifying children/member photos by default.
- No copyrighted image unless user confirms permission.
- No private metadata in public image URLs.
- Public web should provide a text-first mode regardless of cover image.

Recommended default: no image or restrained local landscape/building image. Avoid making sacrament programs visually busy.

## Option 5C: Section placement controls

Let users choose section placement through layout slots, not arbitrary freeform drag/drop.

Available slots:

- Cover
- Opening section
- Sacrament section
- Speakers/messages
- Musical selections
- Ward/stake business
- Announcements
- Closing section
- Back panel/footer

Rules:

- Program order remains authoritative.
- Announcements can be placed on back panel, after program, or in a dedicated insert.
- Internal business/follow-up never appears in public output unless explicitly marked public and allowed by type.
- Empty sections disappear.
- Print preview shows fold lines and panel order.

## Option 5D: Announcement modes

- No announcements
- Selected current announcements after program
- Back-panel announcements
- Separate announcement insert
- QR-only announcement panel linking to public announcement page

Date-active filtering must use one shared helper across editor, public, print, and At-the-Stand surfaces.

## Option 5E: Public program publishing

Add draft/published states for public layout settings.

**Tasks:**

1. Add persisted public layout configuration with versioned JSON shape.
2. Validate allowed presets, paper sizes, panel slots, cover image metadata, and announcement mode server-side.
3. Add print preview with fold/panel guides.
4. Add public preview before publish.
5. Add publish snapshot/version and explicit republish status.
6. Keep public page responsive and text-first.
7. Add QR code that points to stable public URL.
8. Add tests for private-field exclusion, empty sections, escaped text, image absence, all presets, and announcement modes.
9. Add deterministic PDF/print fixtures where practical.

## Recommended first public-program release

Ship only:

- Single-sheet bifold
- Tri-fold bulletin
- Full-page fallback
- No-image cover
- One authorized image slot
- Announcements after program or back panel
- Text-first public page
- Print preview with fold lines
- Published snapshot/version

Defer custom freeform layout until real ward usage shows need.

## Public program acceptance criteria

- Same approved program content drives public and print output.
- Private notes and leadership workflow data never render publicly.
- Public draft changes do not silently change already published output.
- Empty sections are omitted.
- Long names, topics, announcements, and hymns wrap without clipping.
- Print output works in black and white.
- Public page works on mobile without requiring PDF download.
- Keyboard navigation and screen-reader labels cover layout controls and preview.
- Cover image is optional and never required for usable output.

---

# Phase 6 — Accessibility, health, and audit

**Implementation status:** Public layout controls now expose explicit labels, grouped options, keyboard-friendly native controls, live save status, failure recovery, and disabled save state. Public program output has a labelled main landmark and accessible QR link/SVG labels. Browser-level accessibility and print-preview exercise remain open.

## Option 6A: Accessibility coverage

Add keyboard/screen-reader tests for filters, status controls, conflict dialogs, offline state, public pages, print preview, and layout controls. Add large-print/full-page preset.

## Option 6B: Deployment health page

**Implementation status:** Added authenticated Support/System Admin deployment health page at `/settings/health`. It reports safe database, Redis queue, backup-directory, raw-import purge, and notification-delivery checks without displaying secrets or private payloads. Worker process liveness, scheduling, and restore drills remain deployment-level responsibilities.
Show database, queue, backup, purge, and notification-worker state to authorized administrators. Do not expose secrets or private payloads.

## Option 6C: Audit improvements

**Implementation status:** Public layout updates now record ward, actor, action, entity, previous state, and field-level changes in same transaction. Public publish audits now record actual prior meeting status and prior render version instead of assuming every publish starts from draft. Membership/ordinance transitions now record actor, entity, previous workflow state, field-level transition, member/action context, and official-record handoff action in same transaction. Remaining gap: delete-path audit coverage and deployment-level audit retention review.

---

# Execution order

1. Phase 0 privacy/retention/recovery
2. Phase 1 official-record boundary
3. Phase 2 baptism/confirmation and membership coverage
4. Phase 3 meeting readiness
5. Phase 5 public/printed program foundation
6. Phase 4 leadership workflows
7. Phase 6 accessibility/health/audit polish

Public-program work should start after the underlying public/private content boundary is stable, but layout research and a visual prototype can begin immediately.

# Decision needed before public-program UI

Which default should be first-class for Freedom Park Ward?

**Decision:** Per-meeting choice, with single-sheet bifold as ward default.

Implement layout preset at meeting level, inherit ward default when unset, and allow authorized users to override per meeting.

## Sources

[1] https://www.churchofjesuschrist.org/study/manual/general-handbook/29-meetings-in-the-church?lang=eng — General Handbook 29: Meetings in the Church
[2] https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng — General Handbook 18: Performing Priesthood Ordinances, Including Blessings
[3] https://www.churchofjesuschrist.org/study/manual/general-handbook/33-records-and-reports?lang=eng — General Handbook 33: Records and Reports
[4] https://www.churchofjesuschrist.org/study/manual/general-handbook/23-sharing-the-gospel-and-strengthening-new-and-returning-members?lang=eng — General Handbook 23: Sharing the Gospel and Strengthening New and Returning Members
[5] https://www.churchofjesuschrist.org/study/manual/general-handbook/31-interviews-and-other-meetings-with-members?lang=eng — General Handbook 31: Interviews and Other Meetings with Members
[6] https://www.churchofjesuschrist.org/study/manual/general-handbook/38-church-policies-and-guidelines?lang=eng — General Handbook 38: Church Policies and Guidelines
[7] https://www.churchofjesuschrist.org/tools?lang=eng — ChurchofJesusChrist.org Tools
[8] https://tech.churchofjesuschrist.org — Church Technology Forum
[9] https://mormonlifehacker.com/how-to-create-and-print-a-latter-day-saint-mormon-sacrament-meeting-program — Sacrament meeting program example
[10] https://www.ldstemplates.com/sacrament-program-generator — Sacrament program generator example
