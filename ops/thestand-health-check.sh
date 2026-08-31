#!/usr/bin/env bash
set -euo pipefail

STATE_FILE=/run/thestand-health-failures
LOCK_FILE=/tmp/thestand-deploying
HEALTH_URL=http://127.0.0.1:3000/health

if [ -e "$LOCK_FILE" ]; then
  exit 0
fi

if curl --fail --silent --show-error --max-time 8 "$HEALTH_URL" >/dev/null; then
  rm -f "$STATE_FILE"
  exit 0
fi

failures=0
if [ -f "$STATE_FILE" ]; then
  read -r failures < "$STATE_FILE" || failures=0
fi
failures=$((failures + 1))
printf '%s\n' "$failures" > "$STATE_FILE"

if [ "$failures" -lt 2 ]; then
  exit 0
fi

rm -f "$STATE_FILE"
systemctl restart the-stand
