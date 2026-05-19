#!/usr/bin/env bash
#
# Production legacy cleanup — run on the production VM after deployment (e.g. GitHub Actions)
# finishes, when you are ready to drop the nine legacy MongoDB collections and refresh
# market-related Redis keys. Follows docs: prod-cleanup-steps.md (repo root).
#
# Typical flow:
#   1. CI deploys new backend to the VM.
#   2. You SSH in, cd to crypto-backend, ensure .env has MONGO_URI and REDIS_URL.
#   3. Set PROD_CLEANUP_STOP_CMD / PROD_CLEANUP_START_CMD for your process manager.
#   4. Run: ./scripts/prod-legacy-cleanup.sh   (interactive: type yes when prompted)
#      or:  ./scripts/prod-legacy-cleanup.sh --yes   (non-interactive / CI)
#
# Requirements on PATH: mongodump, mongosh, redis-cli, curl. Optional: jq (prettier /health).
#
# Environment (optional):
#   MONGO_URI, REDIS_URL     — export them, or use .env / ENV_FILE (see below).
#   ENV_FILE                 — if set, only this file is sourced (absolute path on the server).
#   Otherwise: .env then .env.production under repo root (later overrides earlier).
#   MONGO_DB_NAME            — default crypto_db
#   PROD_CLEANUP_STOP_CMD    — e.g. 'docker compose -f docker-compose.prod.yml stop backend stream-worker'
#   PROD_CLEANUP_START_CMD   — e.g. 'docker compose -f docker-compose.prod.yml start backend stream-worker'
#   SMOKE_BASE               — default http://127.0.0.1:4001
#
# Usage:
#   ./scripts/prod-legacy-cleanup.sh --dry-run
#   ./scripts/prod-legacy-cleanup.sh --yes
#   ./scripts/prod-legacy-cleanup.sh --yes --skip-stop-start   # you stopped services manually
#   ./scripts/prod-legacy-cleanup.sh --yes --redis-pattern     # SCAN+DEL market:*
#   ./scripts/prod-legacy-cleanup.sh --yes --create-indexes
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LEGACY_COLLECTIONS=(
  coins
  labeled_coins
  cmc_labeled_coins
  labeled_active_coins
  filtered_coins
  coin_raw_data
  coinmasters
  ohlcv_klines
  market_trades
)

REDIS_MARKET_KEYS=(
  market:v2:snapshot
  market:v2:build:lock
  market:v2:revision
  market:trending
  market:top-gainers
  market:top-losers
)

DRY_RUN=0
YES=0
SKIP_STOP_START=0
SKIP_BACKUP=0
REDIS_MODE="targeted" # targeted | pattern | flushdb
CREATE_INDEXES=0
SMOKE_BASE="${SMOKE_BASE:-http://127.0.0.1:4001}"

die() { echo "error: $*" >&2; exit 1; }

usage() {
  sed -n '1,40p' "$0" | tail -n +2 | head -n 28
  cat <<'EOF'

Options:
  --dry-run              Print steps; do not run mongodump/mongosh/redis/start/smoke.
  --yes                  Skip interactive prompt (required if stdin is not a TTY, e.g. CI).
  --skip-stop-start      Do not run PROD_CLEANUP_STOP_CMD / PROD_CLEANUP_START_CMD.
  --skip-backup          Skip mongodump (dangerous; still drops collections if --yes).
  --redis-pattern        Delete all keys matching market:* via SCAN (review in prod first).
  --redis-flushdb        FLUSHDB on Redis DB from REDIS_URL (only if dedicated to this app).
  --create-indexes       Run npm run script:create-indexes after start.
  --smoke-base URL       Override SMOKE_BASE for curl smoke tests.
  -h, --help             Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes) YES=1 ;;
    --skip-stop-start) SKIP_STOP_START=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    --redis-pattern) REDIS_MODE="pattern" ;;
    --redis-flushdb) REDIS_MODE="flushdb" ;;
    --create-indexes) CREATE_INDEXES=1 ;;
    --smoke-base)
      [[ -n "${2:-}" ]] || die "--smoke-base requires a URL"
      SMOKE_BASE="$2"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

load_env_files() {
  if [[ -n "${ENV_FILE:-}" ]]; then
    [[ -f "$ENV_FILE" ]] || die "ENV_FILE is set but file not found: $ENV_FILE"
    set -a
    # shellcheck disable=SC1091
    source "$ENV_FILE"
    set +a
    echo "Loaded: $ENV_FILE" >&2
    return
  fi
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
    echo "Loaded: $ROOT/.env" >&2
  fi
  if [[ -f "$ROOT/.env.production" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env.production"
    set +a
    echo "Loaded: $ROOT/.env.production" >&2
  fi
  if [[ ! -f "$ROOT/.env" ]] && [[ ! -f "$ROOT/.env.production" ]] && [[ -z "${MONGO_URI:-}${REDIS_URL:-}" ]]; then
    echo "note: no $ROOT/.env or .env.production; relying on exported MONGO_URI / REDIS_URL." >&2
  fi
}

require_mongo_redis() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  if [[ -z "${MONGO_URI:-}" ]] || [[ -z "${REDIS_URL:-}" ]]; then
    echo "error: MONGO_URI and REDIS_URL must be set for this run (repo root: $ROOT)." >&2
    echo "" >&2
    echo "  Option A — export in your shell:" >&2
    echo "    export MONGO_URI='mongodb://user:pass@host:27017/crypto_db'" >&2
    echo "    export REDIS_URL='redis://127.0.0.1:6379'" >&2
    echo "" >&2
    echo "  Option B — create $ROOT/.env with those keys (not committed on CI runners)." >&2
    echo "" >&2
    echo "  Option C — point at an env file on the server:" >&2
    echo "    ENV_FILE=/path/to/prod.env ./scripts/$(basename "$0") --yes" >&2
    exit 1
  fi
}

load_env_files
require_mongo_redis

# Destructive steps need explicit confirmation: --yes, or interactive "yes" on a TTY.
if [[ "$DRY_RUN" -eq 0 && "$YES" -eq 0 ]]; then
  if [[ -t 0 ]] && [[ -t 1 ]]; then
    echo "" >&2
    echo "This will mongodump legacy collections (unless --skip-backup), DROP them in MongoDB," >&2
    echo "and DELETE the listed Redis market keys. Backend should be stoppable via PROD_CLEANUP_STOP_CMD." >&2
    echo "" >&2
    read -r -p "Type 'yes' to continue: " reply
    if [[ "${reply,,}" != "yes" ]]; then
      die "aborted. For non-interactive runs use: $(basename "$0") --yes   (preview: --dry-run)"
    fi
    YES=1
  else
    die "non-interactive shell: pass --yes to confirm destructive steps. Example: $(basename "$0") --yes"
  fi
fi

if [[ "$SKIP_BACKUP" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  echo "warning: --skip-backup: no BSON backup before drop. Ensure you have another restore path." >&2
fi

if [[ "$REDIS_MODE" == "flushdb" && "$DRY_RUN" -eq 0 ]]; then
  echo "warning: --redis-flushdb will erase the entire logical Redis DB for this REDIS_URL." >&2
fi

MONGO_DB_NAME="${MONGO_DB_NAME:-crypto_db}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command on PATH: $1"
}

if [[ "$DRY_RUN" -eq 0 ]]; then
  need_cmd mongodump
  need_cmd mongosh
  need_cmd redis-cli
  need_cmd curl
fi

run_cmd() {
  local cmd="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $cmd"
  else
    echo "+ $cmd"
    bash -c "$cmd"
  fi
}

stop_services() {
  if [[ "$SKIP_STOP_START" -eq 1 ]]; then
    echo "Skipping stop (--skip-stop-start). Ensure nothing is writing to Mongo/Redis."
    return 0
  fi
  if [[ -z "${PROD_CLEANUP_STOP_CMD:-}" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] PROD_CLEANUP_STOP_CMD not set (required on real run unless --skip-stop-start)" >&2
      return 0
    fi
    die "Set PROD_CLEANUP_STOP_CMD to stop backend/workers before DB changes, or pass --skip-stop-start if already stopped."
  fi
  run_cmd "$PROD_CLEANUP_STOP_CMD"
}

start_services() {
  if [[ "$SKIP_STOP_START" -eq 1 ]]; then
    echo "Skipping start (--skip-stop-start)."
    return 0
  fi
  if [[ -z "${PROD_CLEANUP_START_CMD:-}" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] PROD_CLEANUP_START_CMD not set (required on real run unless --skip-stop-start)" >&2
      return 0
    fi
    die "Set PROD_CLEANUP_START_CMD to start backend after cleanup, or pass --skip-stop-start and start manually."
  fi
  run_cmd "$PROD_CLEANUP_START_CMD"
}

backup_legacy() {
  if [[ "$SKIP_BACKUP" -eq 1 ]]; then
    echo "Skipping mongodump (--skip-backup)."
    return 0
  fi

  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP_ROOT="$ROOT/.backups/legacy-cleanup/${TS}"
  export TS BACKUP_ROOT MONGO_URI

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] mkdir -p $BACKUP_ROOT/crypto_db"
    for c in "${LEGACY_COLLECTIONS[@]}"; do
      echo "[dry-run] mongodump --uri \"\$MONGO_URI\" --collection $c --out \"$BACKUP_ROOT/crypto_db\""
    done
    return 0
  fi

  mkdir -p "$BACKUP_ROOT/crypto_db"
  local failed=0
  set +e
  for c in "${LEGACY_COLLECTIONS[@]}"; do
    echo "--- mongodump: $c ---"
    if mongodump --uri "$MONGO_URI" --collection "$c" --out "$BACKUP_ROOT/crypto_db"; then
      echo "OK: $c"
    else
      echo "WARN: mongodump failed for $c (collection missing or empty?)" >&2
      failed=1
    fi
  done
  set -e

  local bson_count
  bson_count="$(find "$BACKUP_ROOT" -name '*.bson' 2>/dev/null | wc -l)"
  bson_count="${bson_count//[[:space:]]/}"
  if [[ "${bson_count:-0}" -eq 0 ]]; then
    die "no .bson files under $BACKUP_ROOT; aborting before drop (fix mongodump or use --skip-backup with care)."
  fi
  du -sh "$BACKUP_ROOT" || true
  ls -la "$BACKUP_ROOT/crypto_db/$MONGO_DB_NAME" 2>/dev/null || ls -la "$BACKUP_ROOT/crypto_db" || true
  if [[ "$failed" -eq 1 ]]; then
    echo "warning: one or more mongodump invocations failed; review output before relying on this backup." >&2
  fi
}

drop_legacy() {
  local js
  js=$(printf '%s\n' \
    "db = db.getSiblingDB(\"${MONGO_DB_NAME}\");" \
    'const legacy = [' \
    '"coins","labeled_coins","cmc_labeled_coins","labeled_active_coins",' \
    '"filtered_coins","coin_raw_data","coinmasters","ohlcv_klines","market_trades"' \
    '];' \
    'legacy.forEach((name) => {' \
    '  const dropped = db[name].drop();' \
    '  print(name + ": " + dropped);' \
    '});' \
    'print("remaining count: " + db.getCollectionNames().length);')

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] mongosh \"\$MONGO_URI\" --eval '...drop legacy...'"
    return 0
  fi

  mongosh "$MONGO_URI" --eval "$js"
}

redis_cleanup() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    case "$REDIS_MODE" in
      targeted)
        echo "[dry-run] redis-cli -u \"\$REDIS_URL\" DEL ${REDIS_MARKET_KEYS[*]}"
        ;;
      pattern)
        echo "[dry-run] redis-cli -u \"\$REDIS_URL\" --scan --pattern 'market:*' | xargs -r redis-cli -u \"\$REDIS_URL\" DEL"
        ;;
      flushdb)
        echo "[dry-run] redis-cli -u \"\$REDIS_URL\" FLUSHDB"
        ;;
    esac
    return 0
  fi

  case "$REDIS_MODE" in
    targeted)
      # shellcheck disable=SC2068
      redis-cli -u "$REDIS_URL" DEL ${REDIS_MARKET_KEYS[@]}
      ;;
    pattern)
      redis-cli -u "$REDIS_URL" --scan --pattern 'market:*' | xargs -r redis-cli -u "$REDIS_URL" DEL
      ;;
    flushdb)
      redis-cli -u "$REDIS_URL" FLUSHDB
      ;;
  esac
}

maybe_create_indexes() {
  [[ "$CREATE_INDEXES" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] npm run script:create-indexes"
    return 0
  fi
  need_cmd npm
  npm run script:create-indexes
}

smoke_tests() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] curl health + market endpoints against $SMOKE_BASE"
    return 0
  fi

  echo "--- smoke: GET $SMOKE_BASE/health ---"
  if command -v jq >/dev/null 2>&1; then
    curl -sfS "$SMOKE_BASE/health" | jq .
  else
    curl -sfS "$SMOKE_BASE/health" && echo
  fi

  echo "--- smoke: snapshot / active-coins (503 briefly is OK until snapshot rebuilds) ---"
  curl -sfS -o /dev/null -w "snapshot HTTP %{http_code}\n" "$SMOKE_BASE/api/market/snapshot" || true
  curl -sfS -o /dev/null -w "active-coins HTTP %{http_code}\n" "$SMOKE_BASE/api/market/active-coins" || true
}

echo "=== prod legacy cleanup ==="
echo "ROOT=$ROOT"
echo "MONGO_DB_NAME=$MONGO_DB_NAME"
echo "REDIS_MODE=$REDIS_MODE"
echo "DRY_RUN=$DRY_RUN"

stop_services
backup_legacy
drop_legacy
redis_cleanup
start_services
maybe_create_indexes
smoke_tests

echo "=== done ==="
if [[ "$DRY_RUN" -eq 0 && "$SKIP_BACKUP" -eq 0 && -n "${BACKUP_ROOT:-}" ]]; then
  echo "Backup at: $BACKUP_ROOT"
fi
