#!/usr/bin/env bash
set -euo pipefail

# Verify that a recent PostgreSQL backup and checksum sidecar exist.
# This is a monitoring probe; it does not restore or expose backup contents.

umask 077
BACKUP_DIR="${BACKUP_DIR:-/opt/the-stand/backups}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"

if [[ ! "$MAX_AGE_HOURS" =~ ^[0-9]+$ ]] || (( MAX_AGE_HOURS < 1 || MAX_AGE_HOURS > 8760 )); then
  printf 'Invalid BACKUP_MAX_AGE_HOURS: must be an integer from 1 to 8760\n' >&2
  exit 2
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  printf 'Backup health failed: backup directory unavailable\n' >&2
  exit 1
fi

latest_backup=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' -printf '%T@ %p\n' | sort -nr | sed -n '1s/^[^ ]* //p')
if [[ -z "$latest_backup" ]]; then
  printf 'Backup health failed: no backup found\n' >&2
  exit 1
fi

backup_epoch=$(stat -c '%Y' "$latest_backup")
now_epoch=$(date +%s)
max_age_seconds=$((MAX_AGE_HOURS * 3600))
backup_age=$((now_epoch - backup_epoch))
if (( backup_age < 0 || backup_age > max_age_seconds )); then
  printf 'Backup health failed: newest backup is older than configured limit\n' >&2
  exit 1
fi

checksum_path="${latest_backup}.sha256"
if [[ ! -f "$checksum_path" ]]; then
  printf 'Backup health failed: checksum sidecar missing\n' >&2
  exit 1
fi

if ! (cd "$BACKUP_DIR" && sha256sum --check "$(basename "$checksum_path")" >/dev/null); then
  printf 'Backup health failed: checksum verification failed\n' >&2
  exit 1
fi

printf 'Backup health ok: recent backup and checksum verified\n'
