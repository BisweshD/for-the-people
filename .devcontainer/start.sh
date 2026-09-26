#!/usr/bin/env bash
# Codespace start: run the production server in the background and make its port public.
set -uo pipefail
cd "$(dirname "$0")/.."

if ! curl -fs -o /dev/null http://localhost:3100; then
  nohup pnpm start > /tmp/for-the-people.log 2>&1 &
fi
for _ in $(seq 1 90); do
  curl -fs -o /dev/null http://localhost:3100 && break
  sleep 2
done
gh codespace ports visibility 3100:public -c "$CODESPACE_NAME" || true
echo "For The People: https://${CODESPACE_NAME}-3100.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
