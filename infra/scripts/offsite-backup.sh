#!/usr/bin/env bash
set -euo pipefail

# Replicate local PostgreSQL backup artifacts to an encrypted restic repository.
# RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE must be supplied by the protected
# systemd environment file. No backup contents or credentials are logged.

BACKUP_DIR="${BACKUP_DIR:-/opt/the-stand/backups}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"

if [[ ! -d "$BACKUP_DIR" ]]; then
  printf 'Offsite backup failed: local backup directory unavailable\n' >&2
  exit 1
fi
if [[ ! -r "$RESTIC_PASSWORD_FILE" ]]; then
  printf 'Offsite backup failed: repository password file unavailable\n' >&2
  exit 1
fi

mapfile -t backup_files < <(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name '*.sql.gz.sha256' \) -print)
if (( ${#backup_files[@]} == 0 )); then
  printf 'Offsite backup failed: no local backup artifacts found\n' >&2
  exit 1
fi

restic backup --tag the-stand-local-postgres "$BACKUP_DIR"
restic forget --tag the-stand-local-postgres --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
printf 'Offsite backup ok: replicated %d local backup artifacts\n' "${#backup_files[@]}"
