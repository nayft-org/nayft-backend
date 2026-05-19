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

STORE_NEWS_URL="${STORE_NEWS_URL:-http://127.0.0.1:4001/api/news/store-news}"

echo "[$(date -Iseconds)] POST ${STORE_NEWS_URL}"

curl -fsS -X POST "$STORE_NEWS_URL" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  -w '\n[http_status=%{http_code}]\n'

echo "[$(date -Iseconds)] OK"
