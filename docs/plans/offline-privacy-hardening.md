# Offline Privacy Hardening — Current Status

**Status:** Core implementation complete; authenticated browser coverage remains blocked by the test harness.

## Implemented

- User/ward authorization context matching with fail-closed behavior
- Purge on identity, ward, or authorization mismatch
- Explicit local offline-data deletion
- Saved-copy age and 24-hour stale threshold
- Offline/read-only and confidential-device disclosures
- Minimized offline snapshot payload
- Service-worker cache version `the-stand-offline-v2`
- Cleanup of older offline cache versions
- No generic service-worker caching of `/api/*` responses
- Offline mutation idempotency and revision-conflict handling for supported business-line/private-note operations
- Unsupported publishing, deletion, permission, calling-lifecycle, and membership/ordinance-status writes remain online-only

The application does **not** claim IndexedDB encryption at rest.

## Verification completed

- Offline storage tests passed
- Service-worker privacy tests passed
- Full suite: **308 passed, 1 skipped**
- Typecheck passed
- Production build passed
- Dependency graph generation/check passed
- `git diff --check` passed

## Remaining work

- Repair isolated authenticated Playwright bootstrap/auth callback path.
- Run browser coverage for offline warning, stale state, deletion, read-only restrictions, and authorization-loss behavior.
- Keep browser tests pointed at the isolated E2E database, never production.

## Constraints

Private leadership data, interview substance, credentials, tokens, and official-record payloads must not enter generic service-worker caches. The Stand remains a coordination layer, not the official Church record.
