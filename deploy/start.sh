#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 is not installed. The process file is ecosystem.config.cjs; install pm2 or run: bun src/index.ts" >&2
  exit 1
fi
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
echo "API process josti-api reloaded. Check: curl -fsS http://127.0.0.1:3000/health"
