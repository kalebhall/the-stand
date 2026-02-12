# RELEASE_NOTES.md — The Stand v1.0.0 Release Candidate

Release date: 2026-02-12  
Version: v1.0.0-rc

## Scope

This release candidate closes Phase 13 objectives from `docs/PLANS.md`:
- release notes generated
- schema frozen for 1.0.0
- full regression command set run (`lint`, `typecheck`, `test`, `build`)
- deployment and hardening docs re-verified for a clean Ubuntu deploy path
- bootstrap behavior re-validated at documentation level (Option 1 requirements)

## Highlights

- Ward-scoped architecture with defense in depth remains enforced by design requirements (API permission checks + PostgreSQL RLS).
- Public program endpoints remain token-driven and do not accept `ward_id`.
- Support Admin bootstrap policy remains Option 1: random password (>=24 chars), printed once to logs, `must_change_password=true`.
- Audit logging remains mandatory for admin/support actions.

## Schema Freeze

Schema is frozen for this release candidate at migration:
- `apps/web/drizzle/0008_phase10_membership_import.sql`

No new migrations were added as part of this Phase 13 release-candidate pass.

## Deployment Notes

`docs/INSTALL.md` was aligned with the current monorepo workspace scripts:
- build command uses `npm --workspace @the-stand/web run build`
- migration command uses `npm --workspace @the-stand/web run db:migrate`
- systemd startup command uses `npm --workspace @the-stand/web run start`
- update path includes migration execution before rebuild/restart

`docs/HARDENING.md` was reviewed and required no changes.

## Regression Status

The following repository checks were executed for this candidate:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

All passed in the release-candidate validation run.

## Manual Steps to Cut v1.0.0

Codex cannot create Git tags directly in this workflow; run these commands manually from a clean main branch checkout:

```bash
git fetch origin
git checkout main
git pull --ff-only

git tag -a v1.0.0 -m "The Stand v1.0.0"
git push origin v1.0.0
```

Optional verification:

```bash
git show v1.0.0 --no-patch
```

## Post-Tag Smoke Checklist

- Fresh Ubuntu deploy completes using `docs/INSTALL.md`
- `/health` returns `{ "status": "ok", "db": "connected" }`
- Support Admin bootstrap password appears once in logs and forced rotation works
- Ward provisioning succeeds
- Meeting can be created, published, and viewed in At-the-Stand mode
- Public portal routes only published snapshots
