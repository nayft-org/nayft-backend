#!/bin/bash
# Populates labeled_active_coins collection by calling the endpoint for each page (1-35).
# Requires the backend server to be running. Uses 3-second pause between calls.
#
# Usage: ./scripts/populate-active-coins.sh
# Override base URL: BASE_URL=http://localhost:4001 ./scripts/populate-active-coins.sh

BASE_URL="${BASE_URL:-http://localhost:4001}"

for page in $(seq 1 35); do
  echo "Populating page $page/35..."
  curl -s -X POST "$BASE_URL/api/coins/populate-active-coins?page=$page"
  echo ""
  if [ "$page" -lt 35 ]; then
    sleep 3
  fi
done

echo "Done."
