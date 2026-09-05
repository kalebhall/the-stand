#!/usr/bin/env bash
set -euo pipefail

# Restore one backup into an isolated temporary database and validate core tables.
# Usage: ./restore-smoke-test.sh /path/to/the_stand_YYYYMMDD_HHMMSS.sql.gz

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s /path/to/backup.sql.gz\n' "$0" >&2
  exit 1
fi

BACKUP="$1"
if [ ! -f "$BACKUP" ]; then
  printf 'Backup file not found: %s\n' "$BACKUP" >&2
  exit 1
fi

if [ -f "${BACKUP}.sha256" ]; then
  sha256sum --check "${BACKUP}.sha256"
fi

suffix=$(date +%Y%m%d%H%M%S)
TEST_DB="the_stand_restore_${suffix}_$$"
cleanup() {
  sudo -u postgres dropdb --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sudo -u postgres createdb "$TEST_DB"
gunzip -c "$BACKUP" | sudo -u postgres psql --dbname="$TEST_DB" --set ON_ERROR_STOP=1 --quiet

sudo -u postgres psql --dbname="$TEST_DB" --set ON_ERROR_STOP=1 --tuples-only --no-align <<'SQL'
SELECT to_regclass('public.ward') IS NOT NULL;
SELECT to_regclass('public.meeting') IS NOT NULL;
SELECT to_regclass('public.user_account') IS NOT NULL;
SELECT count(*) >= 0 FROM public.ward;
SELECT count(*) >= 0 FROM public.meeting;
SQL

printf 'Restore smoke test passed: %s\n' "$TEST_DB"
