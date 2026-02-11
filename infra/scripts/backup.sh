#!/usr/bin/env bash
set -euo pipefail

# Simple local backup script for the_stand.
# Assumes local PostgreSQL and pg_dump available.
# Customize retention and destination as desired.

BACKUP_DIR="/opt/the-stand/backups"
DB_NAME="the_stand"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

ts=$(date +"%Y%m%d_%H%M%S")
sudo -u postgres pg_dump "$DB_NAME" | gzip > "${BACKUP_DIR}/${DB_NAME}_${ts}.sql.gz"

# Retain 14 days
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -delete

echo "Backup complete: ${BACKUP_DIR}/${DB_NAME}_${ts}.sql.gz"
