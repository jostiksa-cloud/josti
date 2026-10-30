#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is required. Install it from https://bun.sh before deploying." >&2
  exit 1
fi
bun install --frozen-lockfile
echo "Dependencies installed. Configure .env, then run deploy/migrate.sh and deploy/start.sh."
