# Support Assignment Notifications Implementation Plan

> **For Hermes:** Use this plan as the implementation source of truth. Execute tasks in order and keep acceptance status current.

**Goal:** Ensure support and system administrators learn about actionable access requests and new users, while giving them a secure, auditable queue for claiming and assigning work.

**Architecture:** Keep ward-scoped business notifications on the existing `event_outbox` and BullMQ pipeline. Add a global support-work queue for events that can exist before a ward is provisioned, such as public access requests and newly created users. Later add a separate global operational notification path, rather than fabricating a ward context for global events. Queue records are the source of truth; in-app notifications and optional email are delivery mechanisms.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL, Drizzle schema, existing notification registry/BullMQ worker, Vitest.

---

## Current state and gap

- The application already has support pages for users, provisioning, and access requests.
- `ACCESS_REQUEST_SUBMITTED` exists in the notification registry, but the public access-request route does not emit an event.
- `event_outbox`, `user_notification`, and `notification_subscription` currently require a `ward_id`. Public access requests do not yet have a canonical ward ID, so they cannot safely use the ward notification pipeline.
- Support-created users currently write an audit record only. No persistent assignment item or notification is created.
- Existing support access is cross-ward and must remain explicitly granted and audited; notification receipt must not grant ward access.

## Product decisions

1. Notify only when action is needed. Do not alert admins for every ordinary login or already-complete account creation.
2. Use a shared queue with `UNASSIGNED`, `ASSIGNED`, `IN_PROGRESS`, `WAITING`, `RESOLVED`, and `CLOSED` states.
3. Default assignment behavior is claim-first, not round-robin. This avoids assigning work to unavailable administrators.
4. `SUPPORT_ADMIN` receives support/provisioning work. `SYSTEM_ADMIN` receives global system/provisioning work. Ward admins receive ward-scoped workflow events only.
5. Keep notification content minimal. Emails must not contain private notes or sensitive payloads.
6. Every claim, assignment, status change, and access escalation must be auditable.

## Implementation phases

### Phase 1 — Queue foundation

- Add global `support_work_item` table with polymorphic source reference, work type, status, assignee, timestamps, and uniqueness by source.
- Keep this table non-ward-scoped. Enforce `SUPPORT_ADMIN`/`SYSTEM_ADMIN` authorization at every support queue API and server action; add a dedicated restricted database role or security-definer ingest path before treating database-level isolation as complete.
- Add Drizzle schema representation.
- Create one work item atomically when a public access request is accepted.
- Add tests proving honeypot requests create no work item and valid requests create exactly one.

### Phase 2 — Operational notification delivery

- Add global operational event storage or extend outbox safely to permit `ward_id IS NULL` for global events. Do not use a fake ward.
- Add `SUPPORT_REQUEST_CREATED`, `USER_REQUIRES_ASSIGNMENT`, `SUPPORT_REQUEST_ASSIGNED`, and `SUPPORT_REQUEST_STATUS_CHANGED` to the event registry.
- Add explicit global recipient resolution from active global roles.
- Create recipient-specific in-app notifications with idempotency.
- Keep email optional and provider-neutral.

### Phase 3 — Queue workflow

- Add support queue route and UI under `/support/queue`.
- Show unassigned count on support console/dashboard.
- Implement claim, assign, status, and close actions.
- Re-check support/system authorization and current assignment inside each transaction.
- Use optimistic concurrency so two admins cannot silently overwrite each other.
- Write audit records for every state transition.

### Phase 4 — User-creation producers

- Emit `USER_REQUIRES_ASSIGNMENT` only when a created user lacks required ward/role assignment or was created from support intake.
- Do not emit for ordinary authenticated user refreshes.
- Add producer coverage for support-created accounts and any future provisioning route.
- Deduplicate by source user and unresolved work-item state.

### Phase 5 — Reminders and optional email

- Add configurable reminder escalation for aging unassigned items.
- Add email only after in-app delivery is verified in deployment.
- Record provider handoff/failure independently from queue state.
- Never treat provider acceptance as proof of inbox delivery.

## Acceptance criteria

- Valid public access request creates one `UNASSIGNED` support work item.
- Honeypot and rejected requests create no work item.
- Duplicate processing cannot create duplicate work items.
- Only active support/system administrators can read or mutate global queue records.
- Queue assignment cannot grant ward access.
- Support-admin cross-ward access remains explicit, temporary where applicable, and audited.
- Admin receives an in-app notification for a new actionable work item after worker processing.
- Notification retry does not duplicate queue items or recipient notifications.
- User creation creates an assignment item only when assignment action is required.
- Private request message content is not included in email notification payloads.
- Focused tests, full tests, typecheck, build, dependency checks, and runtime verification pass before delivery is declared complete.

## Verification sequence

From repository root:

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test
npm run typecheck
npm run build
npm run lint --workspace @the-stand/web
npm run test --workspace @the-stand/web

git diff --check
```

For deployment verification, apply the new migration in a disposable or target database, submit one authorized test access request, read back the work item, run the worker, and read back the notification and delivery rows. Report each layer separately.

## Status

- Phase 1: complete in code; runtime database verification blocked by missing database configuration in this environment.
  - Complete: global `support_work_item` migration and Drizzle schema.
  - Complete: atomic public access-request insert plus work-item creation.
  - Complete: honeypot path skips both source and work-item writes.
  - Complete: support-created user insert creates one deduplicated assignment item.
  - Complete: authenticated `/api/support/queue` read endpoint for active `SUPPORT_ADMIN` and `SYSTEM_ADMIN` users.
  - Complete: claim, assign, status, conflict, and audit mutations with transaction boundaries and optimistic `updated_at` checks.
  - Complete: active global-role recheck prevents stale sessions or inactive administrators from using queue.
  - Verified: focused producer/queue tests pass; full tests, root typecheck, web lint, production build, dependency checks, and diff check pass.
  - Blocked: apply migration against disposable/target PostgreSQL database and read back real work-item rows. No `DATABASE_URL`, `PGHOST`, or `PGDATABASE` is configured in this environment.
- Phase 2: complete in code; live worker/database verification blocked by missing deployment services.
  - Complete: separate global event outbox, global user notifications, and global delivery tables; no fake ward ID and no nullable ward changes to ward-scoped tables.
  - Complete: registry entries for `SUPPORT_REQUEST_CREATED`, `USER_REQUIRES_ASSIGNMENT`, `SUPPORT_REQUEST_ASSIGNED`, and `SUPPORT_REQUEST_STATUS_CHANGED`.
  - Complete: public access intake and support-created user producers write global events in the same SQL statement as their source/work-item writes.
  - Complete: queue claim/assignment/status mutations write global events in the same transaction as state and audit changes.
  - Complete: BullMQ global event job and worker processing with pending-event recovery.
  - Complete: active `SUPPORT_ADMIN` and `SYSTEM_ADMIN` recipient resolution, idempotent in-app notification inserts, and delivery records.
  - Complete: minimal notification summaries and server-generated `/support/queue` target; private request messages never enter notification payloads.
  - Deferred to Phase 5: optional email delivery for global notifications. Existing provider-neutral email path remains separate from in-app delivery.
  - Verified: focused global notification, producer, queue, event-registry, and recovery tests pass; full tests, root typecheck, web lint, production build, dependency checks, and diff check pass.
  - Blocked: apply migration, run worker against PostgreSQL/Redis, and read back notification/delivery rows. No `DATABASE_URL`, `PGHOST`, `PGDATABASE`, or Redis service is configured in this environment.
- Phase 3: complete in code; authenticated browser/runtime verification blocked by missing deployment services.
  - Complete: `/support/queue` role-gated page for `SUPPORT_ADMIN` and `SYSTEM_ADMIN`.
  - Complete: queue client UI with loading/error states, claim, assign, status, resolve, and close controls.
  - Complete: active support console shows unassigned queue count and links to queue.
  - Complete: queue API returns active global assignee choices without exposing private source messages.
  - Complete: every mutation rechecks active global authorization, validates assignees, uses optimistic timestamps, writes audit records, and cannot grant ward access.
  - Verified: queue route tests, full tests, root typecheck, web lint, production build, dependency checks, and diff check pass.
  - Blocked: browser interaction/read-back against authenticated PostgreSQL-backed deployment. No database or Redis service is configured here.
- Phase 4: complete in code; runtime database/worker verification blocked by missing deployment services.
  - Complete: support-created accounts atomically create one `USER_ACCOUNT` support work item and one `USER_REQUIRES_ASSIGNMENT` global event.
  - Complete: duplicate support intake returns without creating another work item, audit row, or notification event.
  - Complete: producer payload contains only source type/ID; private intake content is excluded.
  - Complete: notification enqueue occurs only after source/work-item/event SQL succeeds.
  - Complete: ordinary Google account upsert path remains account synchronization only; it emits no assignment work item or operational event.
  - Audited: provisioning actions create/update stake and ward records only; no additional user-creation producer exists there.
  - Verified: support-user producer tests, full tests, root typecheck, web lint, production build, dependency checks, and diff check pass.
  - Blocked: live PostgreSQL duplicate/read-back and Redis worker delivery verification. No database or Redis service is configured here.
- Phase 5: complete in code; live PostgreSQL/Redis/provider verification blocked by missing deployment services.
  - Complete: forward migration adds support reminder tracking and `SUPPORT_REQUEST_REMINDER` event type.
  - Complete: worker reminder sweep finds aging `UNASSIGNED` items using configurable thresholds: `SUPPORT_ASSIGNMENT_REMINDER_AFTER_HOURS`, `SUPPORT_ASSIGNMENT_REMINDER_INTERVAL_HOURS`, and `SUPPORT_ASSIGNMENT_MAX_REMINDERS`.
  - Complete: reminder updates and global outbox inserts are atomic; post-commit enqueue is idempotent.
  - Complete: optional provider-neutral email delivery supports SMTP or webhook, disabled unless provider configuration exists.
  - Complete: email delivery is separate from queue state and in-app processing; success/failure, provider ID, attempt time, and error are recorded independently.
  - Complete: failed post-commit email enqueue is recoverable by worker pending-delivery scan.
  - Complete: provider acceptance is recorded as handoff only; no inbox-delivery claim is made.
  - Verified: focused reminder/email/worker tests, full tests, root typecheck, web lint, production build, dependency checks, and diff check pass.
  - Blocked: apply migration, run aging sweep against PostgreSQL/Redis, and verify SMTP/webhook handoff against deployment. No database, Redis, or email provider configuration is available here.

### Phase 1 implementation notes

The current slice intentionally stops before notification delivery and queue UI. `support_work_item` is global and has no `ward_id`; source uniqueness prevents duplicate items. Public intake uses a data-modifying CTE so access-request persistence and work-item creation share one database statement. Support-created accounts use the same pattern. Queue mutations never write ward roles or grants, so claiming work cannot grant ward access. Notification receipt must not be used as an authorization signal.
