#!/usr/bin/env bash
# Fail CI if forbidden open-string patterns appear outside exemptions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

FAIL=0

find_pattern() {
  local pattern="$1"
  local dir="$2"
  local exempt="$3"
  if command -v rg >/dev/null 2>&1; then
    rg -n "$pattern" "$dir" --glob '*.ts' --glob '!**/node_modules/**' 2>/dev/null | rg -v "$exempt" || true
  else
    grep -rInE "$pattern" "$dir" --include='*.ts' 2>/dev/null | grep -v node_modules | grep -vE "$exempt" || true
  fi
}

hits=$(find_pattern 'z\.record\s*\(' src 'eventRegistry|test|exemption')
if [ -n "$hits" ]; then
  echo "$hits"
  echo "ERROR: z.record() found at trust boundaries"
  FAIL=1
fi

hits=$(find_pattern 'Schema\.Types\.Mixed' src/modules 'exemption')
if [ -n "$hits" ]; then
  echo "WARN: Schema.Types.Mixed present (review required)"
  echo "$hits"
fi

if [ -d ../crypto-market/src ]; then
  hits=$(find_pattern '@crypto_auth_token' ../crypto-market/src '')
  if [ -n "$hits" ]; then
    echo "$hits"
    echo "ERROR: legacy AsyncStorage token key still referenced"
    FAIL=1
  fi
fi

exit $FAIL
