# Reports Hub — Current Status

**Original plan date:** 2026-09-03
**Status:** Initial release implemented and verified

## Implemented

The authenticated `/reports` hub and report routes now provide ward-scoped:

- Speaker frequency and last talk date
- Speaker topic history
- Hymn frequency by position and last use
- Prayer frequency and last assignment
- Assignment overview
- Program completeness warnings
- Date filters
- Notes report with visibility/target/date filters
- Sort controls for members, callings, report sections, and notes

Report data remains structured meeting data only. Private notes are not included in participation reports. Reports use authenticated ward scope and internal-report authorization.

## Verification

- Full suite: **308 passed, 1 skipped**
- Typecheck passed
- Production build passed
- Dependency graph generation/check passed
- `git diff --check` passed

## Remaining work

Not part of this completed slice:

- CSV/PDF export
- Automated assignment recommendations
- Public reports
- Charts requiring a new visualization dependency
- Demographic scoring

Do not treat report counts as rankings or infer non-participation from missing history.
