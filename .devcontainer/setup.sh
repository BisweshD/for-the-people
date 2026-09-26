#!/usr/bin/env bash
# Codespace setup: install, restore the bundled snapshot, and build the production site once.
set -euo pipefail
cd "$(dirname "$0")/.."

corepack enable
pnpm install --frozen-lockfile
pnpm db:setup

# A public demo has no Postgres, so the spend cap and rate limits run per process (see .env.example).
env_file=apps/web/.env.production.local
if [ ! -f "$env_file" ]; then
  printf 'ASK_ALLOW_WITHOUT_DATABASE=1\nIP_HASH_SALT=%s\n' "$(openssl rand -hex 24)" > "$env_file"
fi

pnpm build
