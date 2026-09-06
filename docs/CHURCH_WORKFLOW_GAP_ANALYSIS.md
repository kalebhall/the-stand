# The Stand Church Workflow Gap Analysis

**Date:** 2026-09-04

**Scope:** Compare the current The Stand codebase with the current General Handbook, official Church tools/resources, and Church technology guidance. This is a product and engineering gap analysis, not a replacement for LCR, Member Tools, or official Church policy.

## Executive summary

The Stand is strong as a ward meeting-preparation, conducting, public-program, calling, import, notification, and offline-readiness tool. It is not yet a complete ward operating system, and it should not try to become a replacement for LCR or Member Tools.

The most important missing work is:

1. **Protect offline private data more strongly.** The app stores private notes and meeting snapshots in browser IndexedDB for offline use. The Handbook says Church records are confidential and that electronic copies should be encrypted and password protected where possible.[3]
2. **Separate meeting presentation from official ordinance completion more explicitly.** The Handbook identifies several business cases beyond the current four action types, and the official record must be created or updated in LCR after applicable ordinances.[1][2][3]
3. **Add a proper meeting-workflow layer beyond sacrament-program editing.** Bishopric meetings, ward council, missionary coordination, interviews, and action follow-up are not currently first-class workflows.[1][4][5]
4. **Close operational recovery gaps.** A backup script exists, but there is no visible restore drill, backup health check, alerting, or documented recovery objective.
5. **Make policy-sensitive scripts and permissions safer.** Current templates are editable ward text, but the UI presents them close to scripts and does not consistently expose source classification, approval prerequisites, or the responsible priesthood leader.

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

### P0.1 Encrypt or minimize offline private data

**Finding:** `src/offline/storage.ts` stores user-scoped private notes and meeting snapshots in IndexedDB. The key is scoped to user, ward, and meeting, which is good isolation, but browser storage is not encryption at rest. The offline page also caches the offline route shell.

**Why it matters:** The Handbook says Church records are confidential, access should be limited to authorized users, and electronic copies should be encrypted and password protected where possible.[3][6]

**Recommendation:**

- Add a documented threat model for offline storage.
- Prefer Web Crypto encryption with a key derived from a short-lived authenticated session secret or an explicit device unlock flow.
- Clear or quarantine snapshots on logout, account change, ward change, password reset, or authorization refresh failure.
- Add an explicit “This device contains private ward data” warning and a local-data delete control.
- Never put private API responses in a generic service-worker cache.
- Consider storing less: meeting/program content plus only the private notes needed for conducting.

**Acceptance tests:** user switch, ward switch, logout, expired session, revoked role, browser storage inspection, offline reload, and failed decryption must fail closed.

### P0.2 Add a data-retention and deletion policy

**Finding:** `src/imports/purge.ts` contains a 30-day raw import purge function, but no repository call site schedules it. Audit logs, offline mutation results, notes, and snapshots have no documented retention policy.

**Why it matters:** The Handbook says records should be kept only as long as needed and outdated records should be disposed of so they cannot be reconstructed.[3]

**Recommendation:** Define retention by data class:

- Raw import payloads: short retention, then purge.
- Offline mutation ledger: retain only long enough to guarantee idempotent replay and support troubleshooting.
- Private notes: user/ward policy with explicit deletion.
- Audit events: longer retention with access controls.
- Browser snapshots: delete on authorization change and provide user-controlled purge.

Run the purge job from an actual scheduler or deployment job, emit metrics, and test that it ran.

### P0.3 Verify backup restoration, not only backup creation

**Status:** Resolved in application and deployment runbook. `infra/scripts/restore-smoke-test.sh` now verifies optional checksum, migration state, core schema, representative row count, and cleanup. Latest deployment drill succeeded; off-site encryption/copy remains deployment responsibility, and checksum proof depends on sidecar presence.

**Remaining deployment work:**

- encrypted off-host backup storage;
- backup success/failure monitoring;
- scheduled quarterly restore drill ownership;
- documented RPO/RTO review after production sizing;
- test secrets/configuration needed after restore.

## Priority 1: official Church workflow coverage

### P1.1 Expand sacrament-meeting business types

**Finding:** Current membership/ordinance types are welcome-new-member, baby blessing, priesthood ordination, and priesthood advancement. Handbook 29.2.1.1 also identifies:

- recognition of children who are members of record after baptism and confirmation;
- confirmation of new converts;
- naming and blessing children;
- presenting Aaronic Priesthood ordinations;
- sustain/release business.[1]

The current calling flow covers sustain/release, and baby blessing is covered. Recognition of baptized children and confirmation of new converts are not first-class action types.

**Recommendation:** Add separate preparation records for:

- `RECOGNIZE_BAPTIZED_CHILD`; and
- `CONFIRM_NEW_CONVERT`.

Do not automatically combine these with welcome-new-member. The Handbook explicitly distinguishes children who are baptized and confirmed from people being presented for ward welcome.[1]

### P1.2 Track the official-record handoff without copying LCR data

**Finding:** The app tracks an LCR reminder state, but not the responsible clerk, required form/checklist, handoff date, or verification that the official Church record was updated. Handbook 18.6.3 identifies the Child Record Form, membership record creation, and Blessing Certificate for child blessings; Handbook 33.6 states that membership records are the official means of recording ordinances and that leaders should update them promptly in LCR.[2][3]

**Recommendation:** Add a minimal operational handoff checklist, not an ordinance database:

- record/form preparation needed;
- responsible clerk or leader;
- handoff date;
- LCR update confirmed by;
- certificate/form delivered where applicable;
- source link to the relevant Handbook section.

Do not store ordinance details copied from LCR.

### P1.3 Model priesthood ordination requirements more explicitly

**Finding:** The UI accepts the office as free text in `details`. The API does not validate the office against the action family or distinguish Aaronic offices from Melchizedek offices. The Handbook says Aaronic ordinations are presented in sacrament meeting, while authority and approval requirements differ by office.[1][2]

**Recommendation:** Use a typed office field with allowed values and validation:

- Deacon, Teacher, Priest;
- Elder, High Priest where applicable;
- unknown/not selected only during planning.

Add explicit fields for interview complete, approval confirmed, presenting leader, performing priesthood holder, planned ordinance date, and LCR handoff. Keep “setting apart” entirely separate from ordination.[2]

### P1.4 Classify templates as official instruction versus local prompt

**Finding:** Stand templates contain a mixture of local wording, explanatory text, and Handbook references. Some are presented as a “formal script,” even though the Handbook often supplies required elements or examples rather than one universal fixed script.[2]

**Recommendation:** Each template should declare one of:

- `OFFICIAL_REQUIRED_ELEMENTS`;
- `OFFICIAL_EXAMPLE`; or
- `WARD_PROMPT`.

Display the source link and a warning when a ward prompt is editable. Do not claim that The Stand authorizes, validates, or completes an ordinance.

## Priority 1: missing leadership workflows

### P1.5 Bishopric meeting workspace

**Finding:** The app has sacrament-meeting preparation but no first-class bishopric meeting agenda, recurring agenda sections, assignments, or carry-forward actions.

**Why it matters:** Handbook 29.2.4 describes bishopric meetings as a regular place to counsel, make ward decisions, identify members preparing for ordinances, identify calling candidates, and review assignments.[1]

**Recommendation:** Add a separate leadership-meeting workspace with:

- meeting date and participants;
- agenda templates;
- linked church actions, callings, members, and meetings;
- decisions and assignments;
- due dates and owners;
- private/leadership visibility;
- carry-forward and completion history.

Migration `0053_restricted_leadership_notes.sql` adds action-targeted internal notes. Leadership notes accept only `LEADERSHIP` or `PRIVATE` visibility, require a ward-owned bishopric action, and remain excluded from public output and generic offline snapshots. Bishopric, Ward Council, and Missionary Coordination routes share restricted-note entry/history UI through the filtered workspace. Existing member, meeting, and program-item note targets remain unchanged.

### P1.6 Ward council and missionary coordination support

**Finding:** There is no ward council or weekly missionary coordination workflow. Handbook 29.2.5 and chapter 23 describe regular coordination around members, new members, returning members, ordinances, ministering, and assignments.[1][4]

**Recommendation:** Add lightweight meeting types and action linking before adding complex notes:

- Ward Council;
- Missionary Coordination;
- Ward Youth Council if needed by the ward.

Reuse the action/assignment engine, but keep sensitive notes permission-scoped and separate from meeting programs.

### P1.7 Interviews as scheduled operational work

**Finding:** Priesthood actions have interview fields, and general interview scheduling now supports reminders, operational links, authenticated ICS export, a revocable ward-scoped calendar subscription, and a protected ward-scoped schedule. The schedule has an authenticated IndexedDB read-only offline fallback; offline create/update remains intentionally disabled. Handbook chapter 31 treats interviews and other meetings with members as a distinct leadership workflow.[5]

**Recommendation:** Add an interview record or generalized scheduled conversation record with only operational metadata:

- interview type;
- member;
- leader/interviewer;
- scheduled date;
- completion state;
- linked action/calling;
- private note boundary.

Do not store confidential interview content by default.

## Priority 1: meeting-program completeness

### P1.8 Speaker invitation and preparation lifecycle

**Finding:** The editor stores speaker names and topics, but there is no invitation state, acceptance state, reminder, speaking date confirmation, or missing-topic warning surfaced as a workflow. Handbook 29.2.1.4 says the bishopric selects speakers and extends invitations well in advance.[1]

**Recommendation:** Add optional speaker workflow states:

`PLANNED -> INVITED -> ACCEPTED -> CONFIRMED -> COMPLETED`

Keep this separate from the program item’s public text. Add reminders and a meeting readiness report for missing topic, hymn, prayer, or participant assignments.

### P1.9 Fast-and-testimony and special-meeting rules

**Finding:** The app has a FAST_TESTIMONY template, but the editor still exposes generic program controls. The Handbook says fast-and-testimony meeting has no assigned speakers or special musical selections and normally includes member testimonies instead.[1]

**Recommendation:** Make meeting-type rules visible and enforce them at the editor/API boundary. For example:

- hide or warn on assigned speaker controls in fast-and-testimony meetings;
- preserve the testimony section without treating it as an ordinary speaker lineup;
- document exceptions for ward conference and stake/general conference.

### P1.10 Attendance and participation are absent

**Finding:** No attendance workflow exists in The Stand. Handbook 33.5.1.1 says sacrament meeting attendance is recorded weekly in LCR or Member Tools.[3]

**Recommendation:** Do not duplicate official attendance records casually. If useful, add a reminder/link to record attendance in the official tool, or add a clearly non-authoritative local headcount only with a strong label and retention policy.

## Priority 2: Church technology and meetinghouse operations

### P2.1 Streaming and technology-specialist handoff

**Finding:** The official technology site includes resources for virtual meetings, meetinghouse technologies, internet, audio, broadcasts, and technology-specialist training.[8] The Stand has offline conducting support and public program links but no meeting streaming checklist, technology owner, preflight test, or post-meeting recording deletion reminder.

**Recommendation:** Add an optional meeting technology checklist:

- technology specialist/owner;
- room/audio/streaming readiness;
- authorized stream link;
- start/stop confirmation;
- accessibility check;
- recording deletion reminder.

Do not store credentials or meetinghouse network secrets in The Stand.

### P2.2 Church-tools handoff links

**Finding:** The official Church tools page and Handbook 33 identify LCR, Member Tools, and Ward Directory and Map as the Church’s administrative tools.[3][7] The Stand has imports and reminders but should make the boundary more obvious.

**Recommendation:** Add contextual links and “complete this in LCR/Member Tools” labels for official-record tasks. The Stand should be the coordination layer, not the system of record.

## Priority 2: accessibility, usability, and resilience

- Add keyboard and screen-reader tests for filters, status controls, conflict dialogs, offline indicators, and public/print views.
- Add explicit stale-snapshot age and authorization status to offline mode.
- Add a “delete local offline data” control.
- Add a deployment health page showing database, queue, backup, and notification-worker status.
- Add audit-log views for membership/ordinance transitions with before/after state, actor, source, and timestamp.
- Add a restore/runbook link for administrators.

## Recommended implementation order

1. **Security/privacy:** encrypted or minimized offline storage, authorization revocation handling, retention scheduler, local-data deletion.
2. **Official-record boundary:** LCR handoff checklist, source links, typed priesthood office, template classification.
3. **Meeting readiness:** speaker invitation state, missing-field warnings, fast-and-testimony constraints.
4. **Leadership workflows:** bishopric meeting and ward council action workspace.
5. **Membership coverage:** baptized-child recognition and new-convert confirmation tracking.
6. **Technology operations:** streaming/audio/preflight checklist and post-meeting cleanup.
7. **Optional reporting:** attendance reminder or clearly non-authoritative local headcount.

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
