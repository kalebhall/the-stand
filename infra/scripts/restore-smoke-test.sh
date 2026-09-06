#!/usr/bin/env bash
set -euo pipefail

# Restore one backup into an isolated temporary database and validate schema/migrations.
# Usage: ./restore-smoke-test.sh /path/to/the_stand_YYYYMMDD_HHMMSS.sql.gz

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s /path/to/backup.sql.gz\n' "$0" >&2
  exit 1
fi

BACKUP="$1"
EXPECTED_MIGRATION="${EXPECTED_MIGRATION:-0050_public_cover_metadata.sql}"
if [ ! -f "$BACKUP" ]; then
  printf 'Backup file not found: %s\n' "$BACKUP" >&2
  exit 1
fi

checksum_status="not-present"
if [ -f "${BACKUP}.sha256" ]; then
  sha256sum --check "${BACKUP}.sha256" >/dev/null
  checksum_status="verified"
fi

suffix=$(date +%Y%m%d%H%M%S)_$$
TEST_DB="the_stand_restore_${suffix}"
cleanup_status="not-run"
cleanup() {
  if sudo -u postgres dropdb --if-exists "$TEST_DB" >/dev/null 2>&1; then
    cleanup_status="removed"
  else
    cleanup_status="failed"
  fi
}
trap cleanup EXIT

sudo -u postgres createdb "$TEST_DB"
gunzip -c "$BACKUP" | sudo -u postgres psql --dbname="$TEST_DB" --set ON_ERROR_STOP=1 --quiet

migration_state=$(sudo -u postgres psql --dbname="$TEST_DB" --set ON_ERROR_STOP=1 --tuples-only --no-align -c \
  "SELECT count(*)::int || '|' || coalesce(max(name), '') FROM public._migrations;")
IFS='|' read -r migration_count latest_migration <<<"$migration_state"
if [ "$latest_migration" != "$EXPECTED_MIGRATION" ]; then
  printf 'Migration validation failed: expected %s, found %s\n' "$EXPECTED_MIGRATION" "$latest_migration" >&2
  exit 1
fi

core_state=$(sudo -u postgres psql --dbname="$TEST_DB" --set ON_ERROR_STOP=1 --tuples-only --no-align -c \
  "SELECT (to_regclass('public.ward') IS NOT NULL)::int || '|' ||
          (to_regclass('public.meeting') IS NOT NULL)::int || '|' ||
          (to_regclass('public.user_account') IS NOT NULL)::int || '|' ||
          count(*)::int FROM public.ward;")
IFS='|' read -r ward_table meeting_table user_table ward_count <<<"$core_state"
if [ "$ward_table" != "1" ] || [ "$meeting_table" != "1" ] || [ "$user_table" != "1" ]; then
  printf 'Core schema validation failed\n' >&2
  exit 1
fi

trap - EXIT
cleanup

printf 'Restore smoke test passed: checksum=%s migrations=%s latest_migration=%s ward_rows=%s cleanup=%s\n' \
  "$checksum_status" "$migration_count" "$latest_migration" "$ward_count" "$cleanup_status"
