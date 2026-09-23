# The Stand v2.0.0

Release status: review candidate
Version: v2.0.0

## Summary

v2.0.0 is a clean-start release for the single-user deployment. The database may be recreated from the new baseline; existing v1 database data is not migrated automatically.

## Included

- Explicit ward-scoped PostgreSQL RLS policies for the P0 protected tables.
- Active user/ward assignment validation inside RLS policy checks.
- Redis-backed, hashed, atomically expiring rate limiting.
- Cross-ward and public-token isolation tests.
- Fresh database baseline: `apps/web/drizzle/0000_v2_baseline.sql`.
- Historical v1 migrations archived under `apps/web/drizzle/archive/v1/` and excluded from the migration runner.
- Migration ledger now uses fully qualified `public._migrations` references so the baseline's dump search path cannot break migration recording.
- Application/package version set to `2.0.0`.

## Database reset contract

This release intentionally does not provide an in-place v1-to-v2 migration.

For a new installation or reset:

```bash
npm install
npm --workspace @the-stand/web run db:migrate
npm --workspace @the-stand/web run build
```

The migration runner applies exactly one migration and records:

```text
0000_v2_baseline.sql
```

Before resetting production:

1. Create and verify a backup.
2. Stop web and worker services.
3. Recreate the application database.
4. Run the v2 baseline migration.
5. Bootstrap the support administrator.
6. Build and start the application.
7. Verify `/health`, login, ward access, meeting creation, publication, and public read-only routes.

Do not run the reset against production until the release PR is approved and the release tag has been created.

## Verification evidence

Required gates for this release:

- focused live P0 RLS tests against a fresh PostgreSQL database;
- full unit/component test suite;
- typecheck;
- owning-workspace lint;
- production build;
- dependency graph check;
- migration idempotence check;
- restore smoke test against a v2 backup.

A fresh database is a separate gate from an upgrade of an existing v1 database. v1 upgrade compatibility is intentionally out of scope for v2.0.0.
