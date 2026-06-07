#!/usr/bin/env bash
# Trigger POST /api/news/store-news (CoinDesk ingest) against a running API.
#
# Usage:
#   ./scripts/trigger-store-news.sh
#   STORE_NEWS_URL=https://api.example.com/api/news/store-news ./scripts/trigger-store-news.sh
#
# Cron — every 4 minutes (edit paths and URL for your host):
#   crontab -e
#   */4 * * * * STORE_NEWS_URL=http://127.0.0.1:4001/api/news/store-news /path/to/crypto-backend/scripts/trigger-store-news.sh >> /var/log/store-news-cron.log 2>&1
#
# Make executable once:
#   chmod +x scripts/trigger-store-news.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$BACKEND_ROOT/.env}"

STORE_NEWS_URL="${STORE_NEWS_URL:-http://localhost:4001/api/news/store-news}"

if [ -z "${NEWS_INGEST_API_KEY:-}" ] && [ -f "$ENV_FILE" ]; then
  NEWS_INGEST_API_KEY="$(grep -E '^NEWS_INGEST_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d "'\"" | sed 's/\r$//')"
fi

if [ -z "${NEWS_INGEST_API_KEY:-}" ]; then
  echo "ERROR: NEWS_INGEST_API_KEY is not set (add to .env or export before running)" >&2
  exit 1
fi

echo "[$(date -Iseconds)] POST ${STORE_NEWS_URL}"

curl -fsS -X POST "$STORE_NEWS_URL" \
  -H 'Content-Type: application/json' \
  -H "x-ingest-key: ${NEWS_INGEST_API_KEY}" \
  -d '{}' \
  -w '\n[http_status=%{http_code}]\n'

echo "[$(date -Iseconds)] OK"
