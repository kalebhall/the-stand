# CLAUDE.md — The Stand

## Project Overview

**The Stand** is a ward-scoped web application for preparing, conducting, publishing, and recording sacrament meetings in The Church of Jesus Christ of Latter-day Saints. It manages meetings, callings, announcements, calendar integration, and public program sharing.

## Repository Structure

This is an **npm workspaces monorepo** with the following layout:

```
the-stand/
├── apps/
│   └── web/                  # Next.js 15 application (main app)
├── packages/
│   └── shared/               # Shared TypeScript types and Zod validators
├── infra/                    # Deployment: nginx, systemd, backup/restore scripts
├── docs/                     # Comprehensive project documentation
├── scripts/                  # Root-level build/test runner scripts
└── .github/workflows/        # CI/CD pipelines
```

### Web App Source (`apps/web/`)

```
apps/web/
├── app/                      # Next.js App Router (pages, layouts, API routes)
│   ├── api/                  # API routes (ward-scoped under /w/[wardId]/)
│   ├── dashboard/            # Dashboard page
│   ├── meetings/             # Meeting CRUD and print views
│   ├── callings/             # Calling management
│   ├── announcements/        # Announcement management
│   ├── notifications/        # Notification center
│   ├── settings/             # User and stand-script settings
│   ├── p/                    # Public program sharing routes
│   ├── stand/                # At-the-Stand conducting view
│   ├── login/                # Auth pages
│   └── health/               # Health check endpoint
├── components/               # React components (shadcn/ui)
├── lib/                      # Utility functions
├── src/                      # Core business logic
│   ├── auth/                 # Authentication, roles, permissions
│   ├── db/                   # Drizzle ORM schema, client, RLS, context
│   ├── meetings/             # Meeting domain logic
│   ├── callings/             # Calling lifecycle management
│   ├── announcements/        # Announcement logic
│   ├── calendar/             # Calendar feed integration
│   ├── notifications/        # Event outbox and notification queue
│   ├── stand/                # Presentation rendering
│   ├── imports/              # Calendar/LCR data import
│   ├── hardening/            # Security utilities
│   ├── lib/                  # Rate limiting, version info
│   └── types/                # TypeScript type definitions
└── e2e/                      # Playwright end-to-end tests
```

## Tech Stack

| Layer          | Technology                                        |
| -------------- | ------------------------------------------------- |
| Framework      | Next.js 15.3 (App Router, React Server Components)|
| UI             | React 19, Tailwind CSS 4, shadcn/ui (new-york)    |
| Language       | TypeScript 5.8 (strict mode)                      |
| Database       | PostgreSQL 15+ via Drizzle ORM                     |
| Auth           | NextAuth 5 (beta) — Google OAuth + credentials    |
| Validation     | Zod                                                |
| Background Jobs| BullMQ + Redis (ioredis)                           |
| Unit Tests     | Vitest                                             |
| E2E Tests      | Playwright                                         |
| Linting        | ESLint 9 (flat config)                             |
| CI/CD          | GitHub Actions                                     |
| Runtime        | Node.js 20                                         |

## Development Commands

All commands are run from the **repository root** unless noted.

### Core Workflow

```bash
npm install              # Install all workspace dependencies
npm run lint             # Lint root scripts (ESLint)
npm run typecheck        # TypeScript type-check (shared package)
npm run test             # Run unit tests (validates key route files exist)
npm run build            # Build validation (checks required files exist)
npm run test:e2e         # Run Playwright e2e tests (web workspace)
```

### Web App Commands (from `apps/web/`)

```bash
npm run dev              # Start Next.js dev server
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Lint app, components, lib (--max-warnings=0)
npm run typecheck        # TypeScript type-check
npm run test             # Vitest unit tests
npm run test:e2e         # Playwright e2e tests
npm run db:migrate       # Run Drizzle ORM database migrations
npm run worker           # Start BullMQ background worker
```

## CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on push to `main` and on PRs:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build`

A CodeQL workflow also runs for security analysis.

## Key Conventions

### File Naming

- **Pages/Routes**: `page.tsx`, `route.ts`, `layout.tsx` (Next.js App Router convention)
- **Components**: PascalCase filenames (e.g., `AppNavigation.tsx`)
- **Business logic**: kebab-case or camelCase in `src/` (e.g., `src/auth/permissions.ts`)
- **Test files**: co-located with source, using `.vitest.ts` suffix (e.g., `meetings.vitest.ts`)
- **Config files**: standard names (`next.config.ts`, `drizzle.config.ts`, etc.)

### Code Style

- **TypeScript strict mode** throughout — no `any` unless absolutely necessary
- **ESM modules** (`"type": "module"` in package.json)
- **No `console.log`** — ESLint warns on console usage (only `console.warn` and `console.error` allowed)
- **Zod validation** for request/response payloads and shared types
- **Path aliases**: `@/*` maps to web app root, `@the-stand/shared` maps to shared package

### Variable and Type Naming

- `camelCase` for variables and functions
- `PascalCase` for types, interfaces, and React components
- `SCREAMING_SNAKE_CASE` for constants
- `snake_case` for database column and table names

### API Route Pattern

API routes live under `app/api/` and follow this structure:

- Ward-scoped endpoints: `/api/w/[wardId]/...`
- Global endpoints: `/api/health`, `/api/me`, `/api/auth/[...nextauth]`
- Error responses: `{ error: string, code: string }` with appropriate HTTP status
- Auth checks via `auth()` session helper from NextAuth
- Role/permission checks before data access

### Database Patterns

- **Drizzle ORM** for all database access — schema in `src/db/schema.ts`
- **UUIDs** for all primary keys (`.defaultRandom()`)
- **Timestamps** always with timezone (`{ withTimezone: true }`)
- **Ward isolation**: most tables include a `ward_id` foreign key
- **Row Level Security (RLS)**: enforced at the PostgreSQL level
- **Database context**: SQL session variables (`app.user_id`, `app.ward_id`) set per request
- **Outbox pattern**: async events written to `event_outbox` table, processed by BullMQ worker

### Authentication and Authorization

- **NextAuth 5** with Google OAuth (primary) and optional email/password credentials
- **Argon2id** for password hashing
- **Rate limiting**: 10 password attempts per 10 minutes per IP
- **Role-based access**: global roles and ward-scoped roles
- **Permission helpers**: `canManageCallings()`, `canViewCallings()`, `hasRole()`
- **Ward-level isolation** at both API and database layers

### Component Library

- **shadcn/ui** with `new-york` style variant
- **CSS variables** enabled for theming
- Base color: `zinc`
- Components live in `components/ui/`
- Utility function `cn()` in `lib/utils.ts` for class merging

## Architecture Notes

### Server-First Approach

The app heavily relies on **React Server Components** (RSC). Client-side state is minimal. Most data flows through:

1. Server components fetching data directly via Drizzle ORM
2. API routes for mutations (POST/PUT)
3. NextAuth session for auth state

### Public Sharing

Published meeting programs can be shared via token-based URLs:
- `/p/[meetingToken]` — individual meeting program
- `/p/ward` — ward portal for ongoing access

These render **immutable HTML snapshots** (`meeting_program_render` table) for published programs.

### Background Processing

The outbox pattern is used for async event processing:
1. Domain events written to `event_outbox` table
2. BullMQ worker polls and processes events
3. Notifications delivered via webhook to `NOTIFICATION_WEBHOOK_URL`

### Multi-Ward Isolation

Every ward-scoped query and API route enforces ward isolation:
- API routes validate `wardId` from URL params
- Database context sets `app.ward_id` session variable
- PostgreSQL RLS policies prevent cross-ward data access

## Environment Variables

Key environment variables (see `.env.example`):

| Variable                  | Purpose                              |
| ------------------------- | ------------------------------------ |
| `DATABASE_URL`            | PostgreSQL connection string         |
| `APP_BASE_URL`            | Public application URL               |
| `SESSION_SECRET`          | Session encryption key               |
| `AUTH_SECRET`             | NextAuth secret                      |
| `AUTH_GOOGLE_ID`          | Google OAuth client ID               |
| `AUTH_GOOGLE_SECRET`      | Google OAuth client secret           |
| `PASSWORD_AUTH_ENABLED`   | Enable email/password login          |
| `SUPPORT_ADMIN_EMAIL`     | Support admin bootstrap email        |
| `ENCRYPTION_KEY`          | Data encryption key (32 bytes hex)   |
| `REDIS_URL`               | Redis connection for BullMQ          |
| `NOTIFICATION_WEBHOOK_URL`| Webhook URL for notifications        |

## Testing Guidelines

- **Unit tests**: use Vitest, co-locate test files with source using `.vitest.ts` suffix
- **E2E tests**: use Playwright, test files in `apps/web/e2e/`
- **E2E dev server**: runs on port 3005 with `E2E_TEST_MODE=1`
- **Root test script** (`scripts/vitest.mjs`): validates that key route files exist and the health endpoint returns `status: 'ok'`
- **Root build script** (`scripts/next-build.mjs`): validates required files exist (layout, page, health route, components.json, globals.css)

## Non-Negotiable Principles

These rules must **never** be violated:

1. **Absolute ward isolation** — no user may access data from a ward they don't belong to
2. **RLS is mandatory** — every ward-scoped table must have PostgreSQL Row Level Security enabled with explicit policies
3. **No LCR integration** — The Stand never writes to or reads from Church systems directly
4. **No cross-ward data exposure** — API, DB, and UI layers all enforce ward scoping
5. **No hardcoded secrets** — all secrets via environment variables
6. **Public endpoints never accept `ward_id`** — public routes are read-only published snapshots
7. **All admin/support actions must be audit-logged** — inserts into `audit_log` table
8. **Do not invent features outside `docs/SRS.md`** — follow `docs/PLANS.md` milestone order

If any implementation risks cross-ward leakage, public exposure of internal data, hardcoded secrets, bypassing RLS, or skipping audit logging — **stop and fix the design**.

## Role Model

### Global Roles

| Role            | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `SUPPORT_ADMIN` | System-level admin: creates stakes/wards, assigns ward admins, configures OAuth |
| `SYSTEM_ADMIN`  | Reserved for infrastructure-level operations (diagnostics, metrics)     |

### Ward Roles

| Role                | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `STAND_ADMIN`       | Primary ward admin: manages users/roles, full meeting + calling control |
| `BISHOPRIC_EDITOR`  | Conducting and meeting prep: create/edit/publish meetings, manage callings |
| `CLERK_EDITOR`      | Admin support: view meetings, manage announcements, mark set-apart   |
| `WARD_CLERK`        | View meetings/callings, receive notifications (LCR reminders)        |
| `MEMBERSHIP_CLERK`  | View callings/member notes, receive set-apart reminders              |
| `CONDUCTOR_VIEW`    | Read-only access to dashboard, meetings, and `/stand/{meetingId}`    |

### Permission Enforcement (Three Layers)

Every ward-scoped API route must:
1. **Layer 1**: Verify authenticated user + active ward context + required permission (RBAC)
2. **Layer 2**: Validate ward ID in URL matches session's active ward, and user has a role in that ward
3. **Layer 3**: PostgreSQL RLS enforces isolation even if application has a bug

Role assignment rules:
- Only `SUPPORT_ADMIN` may assign `STAND_ADMIN`
- Only `STAND_ADMIN` may assign other ward roles
- No role escalation beyond the assigner's own scope
- Users may belong to multiple wards; active ward is stored in session

## Database Tables

All ward-scoped tables **must** include `ward_id UUID NOT NULL` with RLS enabled and explicit policies.

Per-request context must be set before any query (`src/db/context.ts`):
```sql
SET LOCAL app.user_id = '<user_uuid>';
SET LOCAL app.ward_id = '<ward_uuid>';
```

Key tables by domain:

| Domain          | Tables                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| Tenancy         | `stake`, `ward`                                                                |
| Auth            | `user_account`, `role`, `user_global_role`, `ward_user_role`, `audit_log`      |
| Meetings        | `meeting`, `meeting_program_item`, `meeting_program_render`, `meeting_business_line` |
| Callings        | `calling_assignment`, `calling_action`                                         |
| Public portal   | `public_program_share`, `public_program_portal`                                |
| Announcements   | `announcement`                                                                 |
| Calendar        | `calendar_feed`, `calendar_event_cache`                                        |
| Members/Imports | `member`, `member_note`, `import_run`                                          |
| Notifications   | `event_outbox`, `notification_delivery`                                        |
| Stand view      | `ward_stand_template`                                                          |

Schema migrations live in `apps/web/drizzle/` (0000–0008). All DB changes require a migration file — never modify the schema without one.

## API Endpoint Reference

All ward-scoped routes follow `/api/w/{wardId}/...`. WardId must match active ward in session.

Standard error response: `{ "error": "string", "code": "ERROR_CODE" }`

| Method          | Path                                              | Auth Required         |
| --------------- | ------------------------------------------------- | --------------------- |
| GET             | `/health`                                         | Public                |
| GET             | `/api/me`                                         | Authenticated         |
| POST            | `/api/account/change-password`                    | Authenticated         |
| POST            | `/api/public/access-requests`                     | Public (rate limited) |
| GET             | `/p/{meetingToken}`                               | Public                |
| GET             | `/p/ward/{portalToken}`                           | Public                |
| GET             | `/api/w/{wardId}/meetings`                        | `canViewMeetings`     |
| POST            | `/api/w/{wardId}/meetings`                        | `canManageMeetings`   |
| GET/PUT/DELETE  | `/api/w/{wardId}/meetings/{id}`                   | `canManageMeetings`   |
| POST            | `/api/w/{wardId}/meetings/{id}/publish`           | `canManageMeetings`   |
| POST            | `/api/w/{wardId}/meetings/{id}/complete`          | `canManageMeetings`   |
| GET/POST        | `/api/w/{wardId}/meetings/{id}/business-lines`    | `canManageMeetings`   |
| GET/POST        | `/api/w/{wardId}/callings`                        | `canViewCallings`     |
| POST            | `/api/w/{wardId}/callings/{id}/extend`            | `canManageCallings`   |
| POST            | `/api/w/{wardId}/callings/{id}/sustain`           | `canManageCallings`   |
| POST            | `/api/w/{wardId}/callings/{id}/set-apart`         | `canManageCallings`   |
| GET/POST/PUT/DELETE | `/api/w/{wardId}/announcements`               | Varies by method      |
| GET/POST        | `/api/w/{wardId}/calendar`                        | Authenticated         |
| POST            | `/api/w/{wardId}/imports/membership`              | `STAND_ADMIN`         |
| POST            | `/api/w/{wardId}/imports/callings`                | `STAND_ADMIN`         |
| GET             | `/api/w/{wardId}/users`                           | `STAND_ADMIN`         |
| POST/DELETE     | `/api/w/{wardId}/users/{id}/roles`                | `STAND_ADMIN`         |
| GET             | `/api/w/{wardId}/notifications/diagnostics`       | Authenticated         |
| POST            | `/api/support/stakes`                             | `SUPPORT_ADMIN`       |
| POST            | `/api/support/wards`                              | `SUPPORT_ADMIN`       |
| POST            | `/api/support/wards/{wardId}/admins`              | `SUPPORT_ADMIN`       |
| GET             | `/api/support/access-requests`                    | `SUPPORT_ADMIN`       |

Import endpoints accept `{ rawText: string }`. Send `commit: false` for dry-run preview; `commit: true` to finalize. Set `LOG_LEVEL=debug` in `.env` for verbose import logging.

## Callings Lifecycle

```
proposed → extended → sustained → set apart
```

- Sustaining a calling **auto-creates** a `meeting_business_line` entry
- Set-apart triggers a clerk notification with explicit LCR instruction
- Only `announced` business lines trigger completion notifications

Business line statuses: `pending` → `included` → `excluded` → `announced`

## Known Implementation Gaps

From `docs/GAP_ANALYSIS.md` (audited 2026-02-14). These are known issues that need to be addressed:

### P0 — Security (Critical)
- **RLS missing on 17 ward-scoped tables** — only `ward_user_role` and `audit_log` have RLS policies in migrations. All other ward tables rely solely on application-level `WHERE ward_id = $1`. RLS policies must be added in a new migration for: `meeting`, `meeting_program_item`, `meeting_program_render`, `meeting_business_line`, `calling_assignment`, `calling_action`, `event_outbox`, `notification_delivery`, `public_program_share`, `public_program_portal`, `announcement`, `calendar_feed`, `calendar_event_cache`, `member`, `member_note`, `import_run`, `ward_stand_template`
- **In-memory rate limiting** — `src/lib/rate-limit.ts` uses a `Map` that resets on restart; should be Redis- or DB-backed

### P1 — Missing Features
- `/settings/public-portal` page does not exist (nav link 404s); no API/UI for portal token management
- Auto-add sustain/release business lines not implemented (schema exists, business logic missing in `src/callings/`)
- Callings page is read-only — lifecycle action buttons (propose/extend/sustain/set-apart) missing from UI
- Ward switcher not implemented (users with multiple ward assignments cannot switch)

### P2 — Incomplete
- Dashboard cards for "next meeting", "draft count", "import summary", and "portal status" are hardcoded
- Raw paste purge job missing for `import_run.raw_text` retention enforcement
- `npm run build` and `npm run test` at repo root are file-existence checks, not real builds/tests
- No `loading.tsx` or `error.tsx` files anywhere in the app

## Documentation

Comprehensive docs live in `/docs/`:

| File                 | Content                                                     |
| -------------------- | ----------------------------------------------------------- |
| `AGENTS.md`          | Authoritative behavioral contract for AI agents and contributors |
| `ARCHITECTURE.md`    | Master architecture specification                           |
| `SCHEMA.md`          | Database schema documentation                               |
| `API.md`             | API endpoint documentation                                  |
| `PERMISSIONS.md`     | Role-based permissions model                                |
| `UI.md`              | UI/UX guidelines and page specifications                    |
| `HARDENING.md`       | Security hardening guide (production)                       |
| `INSTALL.md`         | Installation and deployment guide                           |
| `SRS.md`             | System requirements specification                           |
| `ACCEPTANCE.md`      | Acceptance testing criteria                                 |
| `PLANS.md`           | Phased implementation plan (phases 0–13)                    |
| `GAP_ANALYSIS.md`    | Codebase audit — what's complete vs. missing                |
| `RELEASE_NOTES.md`   | Release notes                                               |
| `README.md`          | Project readme                                              |
