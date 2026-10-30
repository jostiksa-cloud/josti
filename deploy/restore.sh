#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" || -z "${1:-}" ]]; then
  echo "Usage: DATABASE_URL=postgres://... deploy/restore.sh backups/josti-YYYYMMDD.dump" >&2
  exit 1
fi
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" "$1"
echo "Restore finished. Run deploy/migrate.sh before starting the API."
