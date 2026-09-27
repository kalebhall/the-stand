# Actions to Do / LCR Follow-Up Implementation Plan

> **For Hermes:** Use the church-app data vertical-slice and module-boundary workflows when implementing this plan.

**Goal:** Give ward leaders one shared, auditable Actions to Do workspace while keeping calling, membership, and priesthood domain ownership separate.

**Architecture:** Reuse the existing `src/church-actions` foundation as a shared coordination contract, not as a generic domain that owns calling or priesthood records. Calling follow-ups remain produced by the Callings module; priesthood and membership follow-ups remain owned by Membership & Ordinances. The shared workspace reads typed follow-up records and never writes directly to LCR.

**Non-negotiable boundary:** The Stand records local preparation and follow-up. It does not integrate with, write to, or claim completion in LCR. Completion means an authorized leader confirms that the external Church-system step was completed.

---

## Product decision

Do not create a separate standalone domain module called “LCR.” Create a shared **Actions to Do** surface backed by typed action records. Keep ownership with existing modules:

- **Callings:** calling recording/review, sustain/release follow-up, set-apart recording follow-up.
- **Membership & Ordinances:** membership actions and priesthood ordinance follow-up.
- **Shared workspace:** queue, filters, role-aware counts, due dates, completion confirmation, links back to source records, and audit history.

Do not generate an LCR task for every internal transition without a domain rule. `ASSIGNED` is an internal classification and should produce a review/recording follow-up only when the calling requires external recording. `EXTENDED` produces a calling follow-up that remains explicitly labeled as a sustain/recording handoff, not as proof that LCR has a particular required action.

## Scope and ownership

### Phase 1 — Shared contract and calling event mapping

- Extend the shared action vocabulary with calling follow-up types.
- Define deterministic mapping from calling lifecycle events to follow-up intent.
- Add focused tests for all lifecycle statuses, including statuses that intentionally produce no follow-up.
- Do not persist or render yet until the contract is reviewed.

### Phase 2 — Persistence

Create a forward migration and Drizzle schema for a ward-scoped `church_action_follow_up` table:

- `id UUID PRIMARY KEY`
- `ward_id UUID NOT NULL`
- `family TEXT NOT NULL` (`CALLING`, `MEMBERSHIP`, `PRIESTHOOD`)
- `action_type TEXT NOT NULL`
- `status TEXT NOT NULL` (`OPEN`, `IN_PROGRESS`, `COMPLETED`, `NOT_APPLICABLE`)
- `member_name TEXT NOT NULL`
- `calling_assignment_id UUID NULL`
- `membership_ordinance_id UUID NULL`
- `source_event TEXT NOT NULL`
- `source_event_id UUID NOT NULL`
- `description TEXT NOT NULL`
- `official_system TEXT NOT NULL DEFAULT 'LCR'`
- `official_reference_url TEXT NULL`
- `due_date DATE NULL`
- `completed_at TIMESTAMPTZ NULL`
- `completed_by_user_id UUID NULL`
- `created_at` and `updated_at`

Constraints and indexes:

- Ward foreign key and source-entity foreign keys with safe delete behavior.
- Check constraints for family, status, and official system.
- Unique `(ward_id, action_type, source_event_id)` for idempotent event production.
- Queue index `(ward_id, status, due_date, created_at)`.
- RLS enabled and forced with explicit ward policies.

### Phase 3 — Calling producers

Update calling lifecycle mutations so each relevant transition upserts one follow-up in the same transaction as the status/audit/outbox write:

- `EXTENDED` → calling sustain/recording follow-up.
- `ASSIGNED` → assignment recording/review follow-up only when applicable.
- `SET_APART` → record set-apart follow-up.
- `TO_BE_RELEASED` → record release follow-up.
- No duplicate follow-ups on retries or repeated notifications.
- Preserve existing meeting business lines and notification events.

Likely adapters:

- `apps/web/app/api/w/[wardId]/callings/[callingId]/set-apart/route.ts`
- `apps/web/app/api/w/[wardId]/callings/[callingId]/release/route.ts`
- `apps/web/app/api/w/[wardId]/callings/route.ts`
- `apps/web/app/callings/page.tsx`
- `apps/web/src/callings/transition.ts`
- `apps/web/src/notifications/calling-events.ts`

Prefer a shared transaction helper in `src/church-actions/` rather than duplicating inserts in each route.

### Phase 4 — Actions to Do page and dashboard surface

- Add `/actions` or `/actions-to-do` as an operator-only ward-scoped page.
- Add direct API routes for list and status mutation.
- Filter by family, status, member, source, and due state.
- Link each row back to the calling or ordinance source.
- Allow only authorized ward roles to complete or cancel items.
- Add dashboard count/card without weakening the protected conducting core.
- Keep the page unavailable when its optional module is disabled; keep meeting preparation/conducting usable.

### Phase 5 — Priesthood and membership integration

- Reuse existing `meeting_membership_ordinance` records as source records.
- Produce shared follow-ups for priesthood actions only where the Church workflow requires an external record handoff.
- Preserve ward/stake scope. Melchizedek Priesthood ordination is stake-owned; do not present it as a ward sacrament action.
- Keep official-record completion separate from meeting announcement/completion.

Official references:

- [Record Callings](https://www.churchofjesuschrist.org/tools/help/record-callings?lang=eng)
- [Record Aaronic Priesthood Ordinations](https://www.churchofjesuschrist.org/tools/help/record-aaronic-priesthood-ordinations?lang=eng)
- [Record Melchizedek Priesthood Ordinations](https://www.churchofjesuschrist.org/tools/help/record-melchizedek-priesthood-ordinations?lang=eng)

### Phase 6 — Notifications, offline, and acceptance

- Add opt-in notifications for newly created and overdue follow-ups.
- Include follow-ups in private offline snapshots only; never public programs.
- Verify audit records, ward isolation, RLS, retry idempotency, and role restrictions.
- Add browser acceptance for calling transition → action appears → completion → disappears from open queue.

## Explicit non-goals

- No direct LCR API integration or scraping.
- No automatic claim that a Church record was updated.
- No generic runtime plugin system.
- No public display of member follow-up tasks.
- No merging of calling lifecycle records with priesthood ordinance records.
- No ward authorization for stake-owned priesthood actions.

## Verification gates

Run separately after each implementation milestone and again after the final slice:

```bash
cd apps/web
npm run test -- --runInBand
npm run typecheck
npm run lint
npm run build
cd ../..
npm run docs:dependencies
npm run docs:dependencies:check
git diff --check
```

Also run serialized disposable PostgreSQL/RLS tests and browser acceptance before calling the feature complete. Report any deployment or CI gate separately.

## First implementation started

The first code task is the pure calling follow-up contract and regression tests. It intentionally has no database or UI side effects; it establishes the domain vocabulary before persistence and route wiring.

## Completed milestone: Phase 5 priesthood handoff producer

- Completed priesthood ordinance actions now create one idempotent shared Actions to Do follow-up in the same transaction.
- Aaronic and Melchizedek recording references are selected from the priesthood office.
- Ward scope, source ordinance ID, planned date, and explicit human LCR follow-up language are preserved.
- Completion remains local confirmation; The Stand does not write to LCR.
- Focused producer and route regression tests cover idempotent upsert payloads and transaction integration.

## Next milestone: Phase 6 follow-up lifecycle and browser acceptance

- Add completion linkage so completing an Actions to Do item updates the owning membership/priesthood handoff state without claiming LCR completion.
- Add opt-in notifications for newly created and overdue follow-ups.
- Keep shared follow-ups in private offline snapshots only; never public programs.
- Add browser acceptance for priesthood completion → action appears → authorized completion → open queue removal.
- Verify ward isolation, role restrictions, RLS, and retry idempotency end to end.

## Completed Phase 6 slice: completion linkage and private offline projection

- Completing a priesthood Actions to Do record updates the linked completed membership ordinance's local LCR handoff state and writes an audit event in the same transaction.
- Open and in-progress shared follow-ups are included only in authenticated meeting offline snapshots; they are not added to public or stand rendering payloads.
- Focused route coverage verifies the completion linkage and audit path.

## Next milestone: follow-up notifications and browser acceptance

- Add opt-in creation and overdue notifications through the existing ward notification outbox.
- Add browser acceptance for priesthood completion → action appears → authorized completion → open queue removal.
- Verify notification retry idempotency, ward isolation, and disabled-module denial in runtime fixtures.

## Completed Phase 6 slice: notification producers and overdue reminder runner

- Calling follow-up production now emits the existing ward-scoped `CALLING_REQUIRES_FOLLOW_UP` notification event with minimal identifiers and idempotent outbox deduplication.
- Added `remind:church-actions` to create one overdue reminder event per open/in-progress follow-up, skipping wards where Actions to Do is disabled and enqueueing only after commit.
- Membership/priesthood completion already uses the existing LCR-needed notification event; no direct LCR write is performed.

## Remaining acceptance milestone: browser and runtime verification

- Exercise the authenticated desktop/mobile flow for action appearance and completion.
- Verify unauthorized users, disabled modules, cross-ward access, RLS, and notification retry behavior against runtime fixtures.
- Configure and verify the production scheduler for `remind:church-actions`.

## Completed acceptance slice: authenticated browser flow

- Added deterministic disposable E2E fixtures for a ward admin, ward/module state, priesthood ordinance, and open shared follow-up.
- Added Playwright coverage for authenticated Actions to Do appearance, LCR link visibility, desktop-to-mobile layout width, completion, and removal from the open queue.
- Browser flow passed on the local disposable PostgreSQL database.

## Historical runtime blocker: reminder scheduler context

- `remind:church-actions` starts successfully, but the non-superuser test runtime sees zero ward rows without an authorized ward context.
- Production scheduler deployment must provide the repository's approved worker/RLS context before overdue reminder delivery can be called runtime-verified.
- Do not solve this by disabling RLS or granting an unrestricted bypass role.

The RLS-aware runner fix below resolved this local runtime blocker. The production scheduler remains unverified until it runs on the deployment host.

## Completed acceptance slice: RLS-aware reminder scheduler

- The reminder runner now requires `MAINTENANCE_USER_ID`, enumerates only non-revoked ward assignments for that user, sets transaction-local `app.user_id` and `app.ward_id`, and processes each ward through normal RLS.
- Runtime verification against the disposable database processed one overdue follow-up and created one pending notification event; repeat execution is deduplicated.
- Invalid configuration fails before opening a database connection.

## Completed acceptance slice: Actions to Do route boundaries

- Added route coverage for unauthenticated denial, cross-ward denial, disabled-module denial, and transaction-local authenticated ward context.
- Focused route suite passed: 4 tests.

## Remaining deployment milestone

- Add the approved maintenance user assignment and scheduler environment on the deployment host.
- Install and enable `the-stand-church-action-reminders.{service,timer}`.
- Run the deployed oneshot and read back `Result`, safe summary logs, and the pending/processed notification event.
- Keep deployment evidence separate from local verification.
