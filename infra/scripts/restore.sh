#!/usr/bin/env bash
set -euo pipefail

# Restore script for the_stand backups produced by backup.sh
# Usage:
#   ./restore.sh /path/to/the_stand_YYYYMMDD_HHMMSS.sql.gz

if [ $# -ne 1 ]; then
  echo "Usage: $0 /path/to/backup.sql.gz"
  exit 1
fi

BACKUP="$1"
DB_NAME="the_stand"

if [ ! -f "$BACKUP" ]; then
  echo "Backup file not found: $BACKUP"
  exit 1
fi

echo "Restoring $BACKUP into database $DB_NAME ..."
gunzip -c "$BACKUP" | sudo -u postgres psql "$DB_NAME"
echo "Restore complete."
