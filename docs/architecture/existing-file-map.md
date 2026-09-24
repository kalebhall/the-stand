# Existing source file map

## Purpose and method

This is the Phase 0 classification of every current directory directly under `apps/web/src/` plus the three current top-level runner files. It uses the §3.4 rule from the modular conducting plan, not the current folder name alone. A classification records intended ownership for future migration; it does not claim that code has already moved or that imports are currently clean.

**Legend:**

- **Core:** required to prepare/conduct a sacrament meeting.
- **Platform:** cross-cutting infrastructure.
- **Optional module:** independently disableable capability with its own lifecycle or permissions and a Core fallback.
- **Adapter:** translation to persistence, framework, rendering, workers, imports, or external systems.

## Directory classifications

- `announcements/` — **optional module**. Announcements have their own lifecycle and permissions and are not required to conduct a meeting; Core can proceed without announcement content.
- `audit/` — **platform**. Audit recording and redaction are cross-cutting security infrastructure.
- `auth/` — **platform**. Identity, sessions, roles, and authorization support every protected boundary.
- `calendar/` — **optional module**. Calendar feeds and event synchronization can be disabled; meeting preparation has a manual-date fallback.
- `callings/` — **optional module**. Calling lifecycle and assignment workflows have their own permissions and are not required for conducting.
- `church-actions/` — **optional module**. Membership/ordinance follow-up has its own data lifecycle and permission set; a meeting can be prepared and conducted without it.
- `db/` — **adapter**. Drizzle schema, clients, SQL context, and RLS integration translate domain/platform contracts to PostgreSQL. The security rules remain platform contracts even though persistence is an adapter.
- `document-designer/` — **optional module**. Advanced layouts, templates, media, publication administration, and PDF features can be disabled while Core basic rendering remains available.
- `features/` — **platform**. Feature flags and enablement are cross-cutting controls, not a business capability.
- `hardening/` — **platform**. Production-readiness and security checks support all boundaries.
- `i18n/` — **platform**. Locale configuration and message selection are shared application infrastructure.
- `imports/` — **optional module**. LCR, membership, calling, and sacrament-planner imports have separate workflows and can be omitted; manual entry remains the Core fallback.
- `leadership/` — **optional module**. Interviews, reminders, technology follow-up, and related leadership coordination have separate lifecycles; the required conducting workflow does not depend on them.
- `lib/` — **platform**. Shared rate limiting, Redis access, version utilities, and common helpers are cross-cutting. A helper that becomes domain-specific must move behind its owning boundary later.
- `maintenance/` — **adapter**. Retention runners and operational jobs translate deployment scheduling into bounded application operations; they are not user-facing business capabilities.
- `meetings/` — **core**. Meeting lifecycle, program data, readiness, basic rendering, and public-layout primitives support the protected conducting workflow.
- `notes/` — **core**. Conducting notes are explicitly required during the meeting, so the minimum note contract belongs in Core. Optional leadership/private note enhancements must remain separate and permissioned.
- `notifications/` — **optional module**. Notification preferences, delivery, reminders, and queue consumers can be disabled; Core meeting state remains usable without them.
- `offline/` — **platform**. Context generation, storage, synchronization lifecycle, and cleanup are cross-cutting. Core and modules may declare namespaced data through this platform.
- `reports/` — **optional module**. Reports have their own read models and can be disabled without changing preparation or conducting.
- `stand/` — **core**. At-the-Stand presentation and basic meeting rendering are central to conducting.
- `types/` — **platform**. Shared type declarations support compilation and cross-boundary contracts; domain-specific types should be owned by the relevant boundary as contracts mature.

## Top-level source files

- `bootstrap.mjs` — **adapter**. Startup wiring translates process/deployment lifecycle into application initialization.
- `health.mjs` — **adapter**. The health probe exposes application state to deployment and monitoring systems.
- `version.mjs` — **platform**. Application version identity is cross-cutting metadata consumed by health and deployment surfaces.

## Ambiguity decisions

### `church-actions/`

Placed in **Optional Module**. Its membership and ordinance follow-up records have independent lifecycle and permissions. It may contribute context to a meeting, but manual/basic meeting items are the Core fallback. The classification must not imply that the app completes or replaces official Church records.

### `leadership/`

Placed in **Optional Module**. The current directory is primarily interviews, reminders, and technology coordination. Those workflows can be disabled without preventing sacrament-meeting conducting. If a future file proves required for conducting, split that file behind a Core adapter rather than reclassifying the whole directory.

### `notes/`

Placed in **Core** because the plan explicitly requires conducting notes during the meeting. Private leadership notes and other enhanced note types remain separately permissioned optional capabilities; the directory classification follows the minimum required note behavior.

### `hardening/`, `maintenance/`, `reports/`, and `features/`

These are also ambiguous by name but are classified as **Platform**, **Adapter**, **Optional Module**, and **Platform** respectively. Their current responsibilities determine the placement: cross-cutting security, operational runners, independently disableable read models, and enablement controls.

## Migration caution

Do not move directories solely because of this map. Trace imports, define contracts, add focused tests, and preserve RLS, audit, offline, public-snapshot, and route behavior before each future move.
