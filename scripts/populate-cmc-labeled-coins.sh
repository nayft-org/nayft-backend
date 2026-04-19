#!/bin/bash
# Populates cmc_coin_mappings by calling the endpoint for each page (start=1, 101, ..., 8701).
# Requires the backend server to be running. Uses 3-second pause between calls (CMC free tier ~30 calls/min).
#
# Usage: ./scripts/populate-cmc-labeled-coins.sh
# Override base URL: BASE_URL=http://localhost:4001 ./scripts/populate-cmc-labeled-coins.sh

BASE_URL="${BASE_URL:-http://localhost:4001}"

for i in $(seq 0 87); do
  start=$((i * 100 + 1))
  echo "Fetching start=$start ($((i + 1))/88)..."
  curl -s -X POST "$BASE_URL/api/coins/populate-cmc-labeled-coins?start=$start"
  echo ""
  if [ "$i" -lt 87 ]; then
    sleep 3
  fi
done

echo "Done."
