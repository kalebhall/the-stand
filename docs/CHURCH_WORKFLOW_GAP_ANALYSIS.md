# The Stand Church Workflow Gap Analysis

**Date:** 2026-09-04

**Scope:** Compare the current The Stand codebase with the current General Handbook, official Church tools/resources, and Church technology guidance. This is a product and engineering gap analysis, not a replacement for LCR, Member Tools, or official Church policy.

## Executive summary

The Stand is strong as a ward meeting-preparation, conducting, public-program, calling, import, notification, and offline-readiness tool. It is not yet a complete ward operating system, and it should not try to become a replacement for LCR or Member Tools.

The main remaining work is:

1. **Official-record boundary depth.** Some LCR/Member Tools handoff fields and policy-sensitive action requirements remain incomplete; priesthood-office typing is implemented.
2. **Authenticated browser coverage.** Public/login/print renderer coverage exists, but protected page coverage is blocked by the isolated E2E authentication bootstrap.
3. **Operational follow-up.** Backup alerting, quarterly restore-drill ownership, and some deployment-level monitoring still need formal completion.
4. **Product extensions.** CSV/PDF report export, automated recommendations, and additional Church-action types remain optional or planned work.

## Already covered well

- Ward-scoped authentication and database context.
- Meeting creation, editing, publishing, immutable render versions, printing, public links, and At-the-Stand views.
- Sacrament, fast-and-testimony, ward conference, stake conference, and general conference meeting templates.
- Speakers, speaker topics, hymns, prayers, announcements, business lines, calling sustain/release flow, and meeting completion.
- Membership and priesthood follow-up workspace with planned date, responsible leader, interview metadata, LCR reminder state, filters, dashboard queues, audit events, and meeting links.
- Automatic offline snapshot preparation, offline status, local notes, idempotent sync, revision conflicts, and read-only offline membership-action display.
- Import review flows, raw-paste purge code, audit logging, notifications, calendar feeds, public portal, and QR-code generation.

These capabilities are verified in the repository’s acceptance specification and current implementation. The gap is mostly depth, policy boundaries, and operational completeness rather than lack of a basic meeting editor.

## Priority 0: privacy and security boundaries

### P0.1 Offline private data

**Status:** Core mitigation implemented. Offline storage is user/ward scoped, payloads are minimized, authorization mismatch purges local data, explicit deletion exists, stale/read-only disclosures exist, and the service worker excludes `/api/*` responses. IndexedDB encryption at rest is not claimed.

**Why it matters:** The Handbook says Church records are confidential, access should be limited to authorized users, and electronic copies should be encrypted and password protected where possible.[3][6]

**Remaining:** Repair the isolated authenticated browser harness and run browser-level offline privacy coverage. Do not add encryption claims without a real key lifecycle.

### P0.2 Data-retention and deletion policy

**Status:** Implemented. Raw import and bounded audit-log retention run through the operational retention runner and daily systemd timer. Browser snapshots/private notes remain user or authorization lifecycle controlled.

**Why it matters:** The Handbook says records should be kept only as long as needed and outdated records should be disposed of so they cannot be reconstructed.[3]

**Remaining:** Keep operational ownership and retention-period review current in deployment documentation.

### P0.3 Verify backup restoration, not only backup creation

**Status:** Resolved in application and deployment runbook. `infra/scripts/restore-smoke-test.sh` now verifies optional checksum, migration state, core schema, representative row count, and cleanup. Latest deployment drill succeeded; off-site encryption/copy remains deployment responsibility, and checksum proof depends on sidecar presence.

**Remaining deployment work:** backup success/failure alerting, scheduled quarterly drill ownership, and documented RPO/RTO review after production sizing.

## Priority 1: official Church workflow coverage

### P1.1 Expand sacrament-meeting business types

**Status:** Recognition of baptized children, baptism/confirmation follow-up, attendance handoff, welcome-new-member, baby blessing, priesthood ordination, and priesthood advancement are represented as distinct action types. Handbook 29.2.1.1 also identifies:

- recognition of children who are members of record after baptism and confirmation;
- confirmation of new converts;
- naming and blessing children;
- presenting Aaronic Priesthood ordinations;
- sustain/release business.[1]

The current calling flow covers sustain/release, and the action model keeps recognition and baptism/confirmation follow-up separate from welcome-new-member. Do not combine these actions; the Handbook distinguishes children who are baptized and confirmed from people being presented for ward welcome.[1]

**Remaining:** Deeper official-record handoff fields and workflow validation.

### P1.2 Track the official-record handoff without copying LCR data

**Status:** The app tracks operational LCR follow-up state and keeps official records outside The Stand. Handbook 18.6.3 identifies the Child Record Form, membership record creation, and Blessing Certificate for child blessings; Handbook 33.6 states that membership records are the official means of recording ordinances and that leaders should update them promptly in LCR.[2][3]

**Remaining:** Add a minimal operational handoff checklist, not an ordinance database:

- record/form preparation needed;
- responsible clerk or leader;
- handoff date;
- LCR update confirmed by;
- certificate/form delivered where applicable;
- source link to the relevant Handbook section.

Do not store ordinance details copied from LCR.

### P1.3 Model priesthood ordination requirements more explicitly

**Status:** Priesthood office is typed and validated for supported action families. The Handbook says Aaronic ordinations are presented in sacrament meeting, while authority and approval requirements differ by office.[1][2]

**Remaining:** Add or verify explicit interview, approval, presenting-leader, performing-holder, planned-date, and LCR handoff fields where required:

Keep “setting apart” entirely separate from ordination.[2]

### P1.4 Classify templates as official instruction versus local prompt

**Status:** Template classification metadata, source links, editable ward-prompt warnings, and output tests are implemented. The Handbook often supplies required elements or examples rather than one universal fixed script.[2]

Each template declares one of:

- `OFFICIAL_REQUIRED_ELEMENTS`;
- `OFFICIAL_EXAMPLE`; or
- `WARD_PROMPT`.

Do not claim that The Stand authorizes, validates, or completes an ordinance.

## Priority 1: leadership workflows

### P1.5 Bishopric meeting workspace

**Status:** Implemented. `/bishopric` provides protected ward-scoped bishopric, Ward Council, and Missionary Coordination agendas with assignments, owners, due dates, carry-forward, lifecycle/history, linked records, and restricted action notes.

**Why it matters:** Handbook 29.2.4 describes bishopric meetings as a regular place to counsel, make ward decisions, identify members preparing for ordinances, identify calling candidates, and review assignments.[1]

**Remaining:** Broader note-history/read presentation and deployment-level monitoring remain follow-up.

Migration `0053_restricted_leadership_notes.sql` adds action-targeted internal notes. Leadership notes accept only `LEADERSHIP` or `PRIVATE` visibility, require a ward-owned bishopric action, and remain excluded from public output and generic offline snapshots. Bishopric, Ward Council, and Missionary Coordination routes share restricted-note entry/history UI through the filtered workspace. Existing member, meeting, and program-item note targets remain unchanged.

### P1.6 Ward council and missionary coordination support

**Status:** Implemented through the shared filtered leadership workspace. Handbook 29.2.5 and chapter 23 remain policy references.[1][4]

**Remaining:** Ward Youth Council has not been added; sensitive notes remain permission-scoped and separate from meeting programs.

### P1.7 Interviews as scheduled operational work

**Status:** Implemented. Interview scheduling supports operational metadata, reminders, authenticated ICS export, revocable ward-scoped calendar subscription, protected schedule, and read-only offline fallback. Handbook chapter 31 remains the policy reference.[5]

**Remaining:** Offline create/update remains intentionally disabled. Confidential interview content remains excluded.

## Priority 1: meeting-program completeness

### P1.8 Speaker invitation and preparation lifecycle

**Status:** Core lifecycle implemented in dedicated Speaker Lifecycle workspace: `PLANNED → INVITED → ACCEPTED → CONFIRMED → COMPLETED`, server-authoritative transitions, required topic before confirmation, and readiness counts. Handbook 29.2.1.4 remains the policy reference.[1]

**Remaining:** Browser-level reminder delivery and dashboard-wide readiness aggregation.

### P1.9 Fast-and-testimony and special-meeting rules

**Status:** Implemented. Meeting-type validation rejects assigned speakers and special hymns for fast-and-testimony meetings, preserves testimony content, and has focused default-program/API tests. Ward conference and stake/general conference remain explicit meeting types.[1]

### P1.10 Attendance and participation are absent

**Finding:** No attendance workflow exists in The Stand. Handbook 33.5.1.1 says sacrament meeting attendance is recorded weekly in LCR or Member Tools.[3]

**Recommendation:** Do not duplicate official attendance records casually. If useful, add a reminder/link to record attendance in the official tool, or add a clearly non-authoritative local headcount only with a strong label and retention policy.

## Priority 2: Church technology and meetinghouse operations

### P2.1 Streaming and technology-specialist handoff

**Status:** Implemented. Protected `/technology` checklist tracks owner, room/audio/stream/accessibility readiness, authorized HTTPS link, start/stop confirmation, and recording deletion reminder. The official technology site remains the policy/resource reference.[8]

**Remaining:** Confirm production activation/ownership of the technology reminder runner. Credentials and network secrets remain excluded.

### P2.2 Church-tools handoff links

**Finding:** The official Church tools page and Handbook 33 identify LCR, Member Tools, and Ward Directory and Map as the Church’s administrative tools.[3][7] The Stand has imports and reminders but should make the boundary more obvious.

**Recommendation:** Add contextual links and “complete this in LCR/Member Tools” labels for official-record tasks. The Stand should be the coordination layer, not the system of record.

## Priority 2: accessibility, usability, and resilience

- Public layout controls, public output landmarks/labels, login/access-request accessibility, and print renderer media behavior are covered.
- Offline stale age, authorization status, read-only state, and local-data deletion are implemented; authenticated browser coverage remains blocked by the E2E auth harness.
- Deployment health page, retention runner, backup restore smoke test, off-site encrypted replication, and audit retention are implemented.
- Remaining: broader authenticated browser coverage, backup alerting, quarterly restore-drill ownership, and deeper audit-history presentation.

## Recommended implementation order

1. **Official-record boundary:** LCR handoff checklist, typed priesthood office, and policy-sensitive action requirements.
2. **Authenticated browser coverage:** repair isolated auth/bootstrap, then exercise protected workflows.
3. **Operational follow-up:** backup alerting, quarterly restore-drill ownership, and deployment monitoring.
4. **Membership coverage:** additional Church-action types and related official-record handoff depth.
5. **Optional reporting:** attendance reminder or clearly non-authoritative local headcount.

## What not to build

- Do not replace LCR or Member Tools as the official membership/ordinance record.[3]
- Do not store confidential interview content, membership-council details, temple-recommend details, or ordinance records copied from Church systems.
- Do not make The Stand decide priesthood worthiness, ordinance authorization, or Church policy eligibility.
- Do not put leadership/private follow-up metadata into public, printed, or published programs.
- Do not add offline mutation support for publishing, deletion, permissions, calling lifecycle, or membership/ordinance status until the conflict model is independently tested.

## Sources

[1] https://www.churchofjesuschrist.org/study/manual/general-handbook/29-meetings-in-the-church?lang=eng — General Handbook 29: Meetings in the Church
[2] https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng — General Handbook 18: Performing Priesthood Ordinances, Including Blessings
[3] https://www.churchofjesuschrist.org/study/manual/general-handbook/33-records-and-reports?lang=eng — General Handbook 33: Records and Reports
[4] https://www.churchofjesuschrist.org/study/manual/general-handbook/23-sharing-the-gospel-and-strengthening-new-and-returning-members?lang=eng — General Handbook 23: Sharing the Gospel and Strengthening New and Returning Members
[5] https://www.churchofjesuschrist.org/study/manual/general-handbook/31-interviews-and-other-meetings-with-members?lang=eng — General Handbook 31: Interviews and Other Meetings with Members
[6] https://www.churchofjesuschrist.org/study/manual/general-handbook/38-church-policies-and-guidelines?lang=eng — General Handbook 38: Church Policies and Guidelines
[7] https://www.churchofjesuschrist.org/tools?lang=eng — ChurchofJesusChrist.org Tools
[8] https://tech.churchofjesuschrist.org — Church Technology Forum
