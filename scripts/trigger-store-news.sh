#!/usr/bin/env bash
# Trigger POST /api/news/store-news (CoinDesk ingest) against a running API.
#
# Usage:
#   ./scripts/trigger-store-news.sh
#   STORE_NEWS_URL=https://api.example.com/api/news/store-news ./scripts/trigger-store-news.sh
#
# Cron — every 4 minutes (edit paths and URL for your host):
#   crontab -e
#   */4 * * * * STORE_NEWS_URL=http://127.0.0.1:4001/api/news/store-news /path/to/crypto-backend/scripts/trigger-store-news.sh >> /var/log/nayft/trigger-store-news.log 2>&1
#
# Production: reads NEWS_INGEST_API_KEY from ENV_FILE, .env.production, host secrets, or .env.
#
# Make executable once:
#   chmod +x scripts/trigger-store-news.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_SECRETS_FILE="${HOST_SECRETS_FILE:-/nayft_storage/secrets/nayft_backend.env}"

STORE_NEWS_URL="${STORE_NEWS_URL:-http://192.168.1.5:4001/api/news/store-news}"

read_news_ingest_key_from_file() {
  local env_file="$1"
  grep -E '^NEWS_INGEST_API_KEY=' "$env_file" | head -1 | cut -d= -f2- | tr -d "'\"" | sed 's/\r$//'
}

if [ -z "${NEWS_INGEST_API_KEY:-}" ]; then
  if [ -n "${ENV_FILE:-}" ] && [ -f "${ENV_FILE}" ]; then
    NEWS_INGEST_API_KEY="$(read_news_ingest_key_from_file "${ENV_FILE}")"
  else
    for candidate in \
      "${BACKEND_ROOT}/.env.production" \
      "${HOST_SECRETS_FILE}" \
      "${BACKEND_ROOT}/.env"; do
      if [ -f "${candidate}" ]; then
        NEWS_INGEST_API_KEY="$(read_news_ingest_key_from_file "${candidate}")"
        if [ -n "${NEWS_INGEST_API_KEY:-}" ]; then
          ENV_FILE="${candidate}"
          break
        fi
      fi
    done
  fi
fi

if [ -z "${NEWS_INGEST_API_KEY:-}" ]; then
  echo "ERROR: NEWS_INGEST_API_KEY is not set (export it, or add to .env.production, ${HOST_SECRETS_FILE}, or .env)" >&2
  exit 1
fi

echo "[$(date -Iseconds)] POST ${STORE_NEWS_URL} (env=${ENV_FILE:-inline})"

curl -fsS -X POST "$STORE_NEWS_URL" \
  -H 'Content-Type: application/json' \
  -H "x-ingest-key: ${NEWS_INGEST_API_KEY}" \
  -d '{}' \
  -w '\n[http_status=%{http_code}]\n'

echo "[$(date -Iseconds)] OK"
