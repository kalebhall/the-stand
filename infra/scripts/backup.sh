#!/usr/bin/env bash
set -euo pipefail

# Create a private, compressed PostgreSQL backup with a checksum sidecar.
# Configure BACKUP_DIR and DB_NAME through the environment when needed.

umask 077
BACKUP_DIR="${BACKUP_DIR:-/opt/the-stand/backups}"
DB_NAME="${DB_NAME:-the_stand}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

ts=$(date +"%Y%m%d_%H%M%S")
backup_path="${BACKUP_DIR}/${DB_NAME}_${ts}.sql.gz"
temporary_path="${backup_path}.tmp"
cleanup() {
  rm -f "$temporary_path"
}
trap cleanup EXIT

sudo -u postgres pg_dump "$DB_NAME" | gzip -n > "$temporary_path"
mv -f "$temporary_path" "$backup_path"
sha256sum "$backup_path" > "${backup_path}.sha256"

# Retain 14 days of backup artifacts and checksum sidecars.
find "$BACKUP_DIR" -type f \( -name "*.sql.gz" -o -name "*.sql.gz.sha256" \) -mtime +14 -delete

printf 'Backup complete: %s\nChecksum: %s.sha256\n' "$backup_path" "$backup_path"
