# Church Actions and Follow-up Implementation Plan

> **For Hermes:** Implement this plan task-by-task. Preserve the distinction between callings, membership actions, and priesthood ordinances.

**Goal:** Give the bishopric one place to plan, prepare, conduct, and finish calling, membership, and priesthood-related follow-up without pretending to replace LCR or storing sensitive ordinance records.

**Architecture:** Keep calling assignments and membership/ordinance actions as separate domain records because their Church workflows differ. Share a typed follow-up vocabulary, person/date/owner/note presentation, dashboard grouping, audit conventions, and status-history patterns. Meeting business remains a separate presentation concern. Priesthood ordination records track preparation and an LCR follow-up reminder only; they do not become permanent ordinance records in The Stand.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL migrations, existing raw `pg` routes, Vitest, existing meeting-business and calling lifecycle services.

---

## Domain rules

- **Callings** retain their existing lifecycle: proposed, extended, sustained, set apart, active assignment, and release.
- **Membership actions** cover welcome-new-member and baby-blessing preparation/follow-up.
- **Priesthood actions** cover ordination and advancement preparation/follow-up.
- Priesthood ordination is not labeled “set apart.” Setting apart remains a calling action.
- Interviews track only operational facts: needed, scheduled, completed, interviewer, and date. Do not store interview content.
- LCR tracking stores a reminder/checklist state and completion date only. No LCR ordinance record is copied into The Stand.
- Public meeting programs include only explicitly approved meeting business. Follow-up records and private notes never render publicly by default.
- Every record is ward-scoped, auditable, and safe to use offline after the offline slice is added.

## Shared fields and type-specific fields

Shared follow-up presentation:

- person/member
- action label
- planned date
- responsible leader
- status
- private/leadership notes
- created and completed timestamps
- audit history

Calling-specific behavior:

- propose, extend, sustain, set apart, release
- meeting-business queue for sustain/release
- calling assignment history and active state

Membership-specific behavior:

- action type: welcome new member or baby blessing
- reason/details
- optional meeting/service date
- no calling release or sustain transitions

Priesthood-specific behavior:

- action type: ordination or advancement
- office (Deacon, Teacher, Priest, Elder, as applicable)
- interview status/date/interviewer
- planned ordinance date
- LCR follow-up status/date
- no release transition
- no permanent ordinance record

## Implementation phases

### Phase 1: Domain foundation

1. Add shared TypeScript types for action families, statuses, interview state, and LCR follow-up state.
2. Add pure transition helpers with explicit allowed transitions for each family.
3. Add tests for valid/invalid transitions and the ordination-versus-setting-apart distinction.

### Phase 2: Expand membership/ordinance persistence

1. Add nullable planning fields to `meeting_membership_ordinance`: planned date, interview status/date/interviewer, responsible user, LCR follow-up status/date, and completed-by metadata where needed.
2. Preserve the existing meeting presentation relationship; do not create a second permanent ordinance table.
3. Add API boundary validation for action type, office, dates, interview state, and LCR state.
4. Add append-only action history or audit events for planning, interview completion, announcement, LCR reminder, and completion.
5. Add focused route tests, including ward isolation and invalid payloads.

### Phase 3: Calling and membership actions workspace

1. Add a shared “Church Actions” page or dashboard section with separate Callings, Membership, and Priesthood groups.
2. Reuse common cards for person, status, planned date, owner, and next action.
3. Keep calling-specific controls only on calling records.
4. Add filters for needs interview, scheduled, action needed, and overdue.
5. Link each item to its meeting or calling detail page.

### Phase 4: Meeting and At-the-Stand integration

1. Keep meeting business separate from preparation records.
2. Allow an eligible membership action to be attached to a meeting when it needs presentation or announcement.
3. Render only approved meeting wording in At-the-Stand.
4. Keep private preparation notes and interview metadata out of print/public output.
5. Preserve the existing Introduction and visiting-leader behavior.

### Phase 5: Follow-up completion and LCR reminder

1. Add explicit post-meeting actions: action needed, performed, and LCR update needed.
2. Add “Mark LCR updated” without storing LCR ordinance data.
3. Add dashboard counts and notifications for overdue follow-up.
4. Add audit entries for every state-changing action.

### Phase 6: Offline and conflict-safe operation

1. Include the latest authorized action snapshot in offline data.
2. Queue safe status changes for reconnect.
3. Use the existing conflict-resolution design for concurrent changes.
4. Never silently overwrite a newer interview, completion, or LCR-follow-up update.

## Initial acceptance criteria

- A bishopric user can distinguish calling, membership, and priesthood actions.
- A priesthood action can be planned, assigned an interview, scheduled, marked performed, and marked LCR-updated.
- A priesthood action has no release or calling-sustain controls.
- A calling retains its existing sustain, set-apart, and release workflow.
- Interview and LCR fields are operational metadata only.
- Public and printed programs do not expose private follow-up data.
- All mutations enforce ward scope and produce audit events.

## Verification sequence

Run from `/root/workspaces/the-stand`:

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test
npm run typecheck
npm run build
git diff --check
```

For each phase, run focused tests first and do not claim the phase complete until the full sequence passes.
