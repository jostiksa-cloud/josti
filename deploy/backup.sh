#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required. This script dumps the PostgreSQL database used by Supabase or your host." >&2
  exit 1
fi
mkdir -p "${BACKUP_DIR:-./backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump --format=custom --no-owner --file "${BACKUP_DIR:-./backups}/josti-${stamp}.dump" "$DATABASE_URL"
echo "Backup written to ${BACKUP_DIR:-./backups}/josti-${stamp}.dump"
