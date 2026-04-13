#!/usr/bin/env bash
# Trigger POST /api/coins/create-collections against a running API.
#
# Usage:
#   ./scripts/trigger-create-collections.sh
#   CREATE_COLLECTIONS_URL=https://api.example.com/api/coins/create-collections ./scripts/trigger-create-collections.sh
#
# Example cron (adjust paths/URL):
#   */30 * * * * CREATE_COLLECTIONS_URL=http://127.0.0.1:4001/api/coins/create-collections /path/to/crypto-backend/scripts/trigger-create-collections.sh >> /var/log/create-collections-cron.log 2>&1
#
# Make executable once:
#   chmod +x scripts/trigger-create-collections.sh

set -euo pipefail

CREATE_COLLECTIONS_URL="${CREATE_COLLECTIONS_URL:-http://192.168.1.5:4001/api/coins/create-collections}"

echo "[$(date -Iseconds)] POST ${CREATE_COLLECTIONS_URL}"

curl -fsS -X POST "$CREATE_COLLECTIONS_URL" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  -w '\n[http_status=%{http_code}]\n'

echo "[$(date -Iseconds)] OK"

