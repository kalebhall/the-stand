# PLANS.md — The Stand Current Roadmap

This document tracks remaining product and operational work. Completed baseline phases are recorded for traceability, not as open implementation tasks.

## Non-negotiable boundaries

- Ward isolation enforced at API and database/RLS layers.
- The Stand supplements, never replaces, official Church systems.
- Public routes expose published snapshots only and exclude private workflow data.
- Official membership, ordinance, attendance, and record completion remain in Church systems.
- Do not add secrets, credentials, or copied official records to application data.
- Do not enable new offline mutations until authorization, idempotency, and conflict handling are tested.

## Completed baseline

- Repository, Next.js/TypeScript, workspace scripts, Vitest, build, and deployment documentation.
- PostgreSQL schema, migrations, ward context, RLS, authentication, password rotation, roles, permissions, audit logging, and access requests.
- Dashboard, meeting CRUD, templates, ordered program items, publish snapshots, print output, public portal, QR output, and At-the-Stand.
- Callings lifecycle: proposed, extended, sustained, set apart, active assignment, release, and set-apart queue.
- Membership/ordinance workspace, typed action vocabulary, LCR follow-up state, priesthood-office validation, and ward-scoped action routes.
- Speaker lifecycle workspace with server-authoritative transitions and meeting readiness indicators.
- Bishopric, Ward Council, and Missionary Coordination private workspaces with assignments, due dates, carry-forward, linked records, and restricted notes.
- Scheduled interviews with protected schedule, reminders, ICS export, revocable calendar subscription, and read-only offline fallback.
- Technology checklist with authorized HTTPS links, readiness fields, dashboard visibility, and reminder runner.
- LCR/member/calling imports with review, dry-run, commit, idempotency, and raw-paste retention purge.
- Notification center, event outbox, worker processing, subscriptions, delivery tracking, email/provider-neutral configuration, and diagnostics.
- Public layout presets, print/public preview, published snapshots, accessible output, announcements, template classification, and text-first/QR output.
- Offline authorization lifecycle, minimized snapshots, stale/read-only disclosures, local deletion, service-worker API exclusion, supported mutation idempotency, and conflict handling.
- Health page, retention scheduler, backup restore smoke test, encrypted off-site replication, and operational runbooks.
- Member, calling, report, and notes sorting controls.

## Remaining roadmap

### 1. Official-record boundary depth

- Add or finish operational LCR/Member Tools handoff checklist fields: responsible clerk/leader, handoff date, confirmation, certificate/form delivery, and source link where required.
- Keep official records outside The Stand.
- Preserve distinction between ordination and setting apart.

### 2. Browser verification

- Repair isolated authenticated Playwright bootstrap/auth callback.
- Run protected coverage against dedicated E2E PostgreSQL, never production.
- Cover authenticated filters, status controls, conflict dialogs, offline privacy state, public preview, and print preview.

### 3. Operational follow-up

- Formalize backup success/failure alerting.
- Assign quarterly restore-drill ownership and record RPO/RTO review.
- Confirm production activation and ownership for all reminder runners.
- Expand deployment-level worker/process monitoring where needed.

### 4. Workflow depth

- Dashboard-wide speaker readiness aggregation and browser-level reminder delivery.
- Broader leadership note-history/read presentation if required.
- Ward Youth Council only after validating actual need.
- Additional Church-action requirements only when grounded in official Church guidance.

### 5. Optional product extensions

- CSV/PDF report export.
- Automated assignment recommendations.
- Public reports, charts, and demographic scoring only after explicit product review.
- Attendance reminder/link or clearly non-authoritative local headcount; never duplicate official attendance records by implication.

## Verification gate for code changes

From repository root:

```bash
npm run docs:dependencies
npm run docs:dependencies:check
npm test
npm run typecheck
npm run build
git diff --check
```

Deploy only after local verification, commit/push, deployment safety checks, and live health verification. Update this roadmap when scope changes; do not leave completed work listed as an open task.

## Failure rule

Stop and correct before continuing if a change causes cross-ward leakage, disabled RLS, public exposure of private data, hardcoded secrets, missing audit coverage, or unverified destructive/offline behavior.
