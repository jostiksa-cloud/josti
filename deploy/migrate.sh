#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and set DATABASE_URL for Supabase PostgreSQL." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a
bun src/db/migrate-cli.ts
