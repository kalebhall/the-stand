# Offline Privacy Hardening Implementation Plan

> **For Hermes:** Implement task-by-task with strict TDD and verify each completed slice.

**Goal:** Reduce the risk of exposing confidential ward coordination data from browser offline storage while preserving the existing read-only/offline workflow.

**Architecture:** Keep IndexedDB as a minimized, user-and-ward-scoped cache. Treat the server session as the authorization authority whenever online, clear all local stores and the named service-worker cache on identity/ward mismatch or explicit deletion, and show clear stale/offline/privacy state in the UI. Do not claim IndexedDB encryption at rest without a real key lifecycle.

**Tech Stack:** Next.js/React, TypeScript, IndexedDB, service worker cache, Vitest/jsdom, Playwright with isolated PostgreSQL.

---

## Scope and constraints

- The Stand remains a coordination layer, not the official Church record.
- Offline writes remain limited to already-supported private notes and non-authoritative conducting progress; publishing, deletion, permissions, calling lifecycle, and membership/ordinance status remain online-only.
- Private notes, leadership data, interview substance, credentials, tokens, and official-record payloads must not enter generic service-worker caches.
- Every cache read must be scoped to the authenticated user and active ward.
- Explicit deletion must clear IndexedDB snapshots, interview snapshots, queued mutations, context metadata, and `the-stand-offline-v1`.

## Implementation order

### Task 1: Authorization lifecycle contract

- Files: `apps/web/src/offline/storage.ts`, `apps/web/src/offline/storage.vitest.ts`
- Add pure, tested decisions for matching cached context and determining whether online session context is authorized.
- Preserve fail-closed behavior for missing identity/ward data.
- Verify focused storage tests fail first, then pass.

### Task 2: Online authorization refresh and revocation purge

- Files: `apps/web/components/offline-stand-button.tsx`, `apps/web/app/stand/[meetingId]/offline/offline-stand-page.tsx`
- Refresh `/api/me` on initial load, visibility return, reconnect, and before saving a snapshot.
- If the authenticated identity or active ward changes, clear local offline data before loading or saving.
- If the server denies the session, clear local data and show a privacy-safe signed-out/re-authentication state.
- Add focused component tests where existing test infrastructure supports the path.

### Task 3: Staleness and privacy disclosure

- Files: `apps/web/src/offline/storage.ts`, offline UI components, component tests
- Add a shared age formatter and stale threshold contract.
- Show saved timestamp, age, read-only/offline state, authorization context, and explicit confidential-device warning.
- Keep wording factual: browser storage is minimized but not claimed encrypted.

### Task 4: Cache minimization and service-worker review

- Files: snapshot API/mapper, `public/sw.js`, storage tests
- Remove unnecessary fields from offline payloads, especially sensitive workflow metadata not needed for conducting.
- Confirm generic service-worker caching never stores private API responses.
- Add regression tests for forbidden fields and cache names.

### Task 5: Authenticated browser coverage

- Files: `apps/web/e2e/offline-privacy.spec.ts`, Playwright fixtures
- Seed an isolated meeting and authorized user.
- Verify privacy warning, stale/offline indicator, deletion control, and read-only restrictions.
- Verify no production database or credentials are used.

### Task 6: Operational verification and documentation

- Update `docs/CHURCH_WORKFLOW_IMPLEMENTATION_PLAN.md` and dependency graph.
- Run focused tests, full tests, typecheck, build, dependency checks, and diff check.
- Deploy only after local gates pass; verify production health and the authenticated path separately.

## Acceptance criteria

- Context mismatch cannot load or retain another user’s or ward’s cached data.
- Online authorization loss clears all local offline data and the named cache.
- Explicit deletion clears all local stores and visibly returns the UI to a safe state.
- Offline UI identifies saved age, offline/read-only status, and confidential local-data risk.
- No UI or documentation claims IndexedDB is encrypted at rest.
- Existing offline read-only and supported note-sync behavior remains intact.
