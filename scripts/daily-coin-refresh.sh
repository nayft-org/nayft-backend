#!/usr/bin/env bash
#
# Daily coin data refresh: exchange ingestion → labeled coins → active markets (all pages).
# Intended for cron (e.g. once per 24h). Requires the API process to be reachable.
#
# Order (matches backend coin populate flow):
#   1. POST /api/coins/create-collections
#   2. POST /api/coins/populate-labeled-coins
#   3. POST /api/coins/populate-active-coins?page=1..MAX_PAGE
#
# Usage:
#   ./scripts/daily-coin-refresh.sh
#   BASE_URL=http://127.0.0.1:4001 ./scripts/daily-coin-refresh.sh
#
# Optional env:
#   BASE_URL          — API origin only (default http://localhost:4001)
#   MAX_PAGE          — last CoinGecko markets page (default 35, must match controller)
#   SLEEP_BETWEEN     — seconds between active-coin page calls (default 3)
#   CURL_OPTS         — extra curl args (e.g. '-k' or '-H @headers.txt')
#
# Cron example (daily at 02:30 UTC):
#   30 2 * * * BASE_URL=http://127.0.0.1:4001 /path/to/crypto-backend/scripts/daily-coin-refresh.sh >> /var/log/daily-coin-refresh.log 2>&1
#
# Make executable:
#   chmod +x scripts/daily-coin-refresh.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4001}"
BASE_URL="${BASE_URL%/}"
MAX_PAGE="${MAX_PAGE:-35}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-3}"

# shellcheck disable=SC2206
CURL_OPTS=( ${CURL_OPTS:-} )

log() {
  echo "[$(date -Iseconds)] $*"
}

post_json() {
  local url="$1"
  local label="$2"
  log "POST $label → $url"
  curl -fsS -X POST "$url" \
    "${CURL_OPTS[@]}" \
    -H 'Content-Type: application/json' \
    -d '{}' \
    -w '\n[http_status=%{http_code}]\n'
  log "OK $label"
}

log "Starting daily coin refresh (BASE_URL=$BASE_URL MAX_PAGE=$MAX_PAGE)"

post_json "$BASE_URL/api/coins/create-collections" "create-collections"
post_json "$BASE_URL/api/coins/populate-labeled-coins" "populate-labeled-coins"

for page in $(seq 1 "$MAX_PAGE"); do
  log "populate-active-coins page $page/$MAX_PAGE"
  curl -fsS -X POST "$BASE_URL/api/coins/populate-active-coins?page=$page" \
    "${CURL_OPTS[@]}" \
    -H 'Content-Type: application/json' \
    -d '{}' \
    -w '\n[http_status=%{http_code}]\n'
  if [ "$page" -lt "$MAX_PAGE" ] && [ "${SLEEP_BETWEEN}" -gt 0 ]; then
    sleep "$SLEEP_BETWEEN"
  fi
done

log "Daily coin refresh finished successfully."
