# Production cleanup — runbook (post–`main` deploy)

Run these steps on the **production VM** after the legacy-cleanup code is merged to **`main`** and you are ready to align the live database and cache with the new architecture. This runbook assumes the same cleanup as documented in [`legacy-cleanup-final.md`](./legacy-cleanup-final.md).

**Goal:** remove the nine **legacy MongoDB collections** the app no longer uses, optionally clear **market-related Redis** keys so snapshots rebuild cleanly, deploy the new backend, and verify APIs.

**Not included:** wiping all of `crypto_db`, `FLUSHALL` on a shared Redis, or deleting Atlas backups — only do those if your policy explicitly requires a full reset and you understand data loss.

---

## 0. Preconditions

- [ ] Code on `main` includes the legacy cleanup (no dual-write flags, no reads from legacy collections).
- [ ] You have **MongoDB admin** access (URI with rights to `mongodump` / `drop`).
- [ ] You have **Redis** CLI or UI access (`REDIS_URL` from production `.env`).
- [ ] Maintenance window agreed (brief **503** possible on `/api/market/snapshot` until snapshot rebuilds after Redis clear).
- [ ] Replace placeholders below: `APP_DIR`, `MONGO_URI`, `REDIS_CLI`, `SERVICE_NAME` (systemd unit, PM2 name, or Docker stack commands).

---

## 1. SSH and locate the app

```bash
ssh <user>@<prod-host>
cd <APP_DIR>   # e.g. /var/www/crypto/crypto-backend
```

Confirm branch and pull (if you deploy by git on the VM):

```bash
git fetch origin && git checkout main && git pull origin main
```

---

## 2. Production environment sanity

Ensure production `.env` (or your secret store) **does not** rely on removed variables:

- Remove if present: `COIN_DATA_DUAL_WRITE_ENABLED`, `COIN_DATA_READ_FROM_NEW_COLLECTIONS`, `COIN_DATA_REQUIRE_INTERNAL_COIN_ID` (names may have varied; match what you historically set).

Confirm required variables still exist, for example:

- `MONGO_URI` — must point at production `crypto_db` (or your actual DB name).
- `REDIS_URL`
- `NODE_ENV=production`
- `JWT_SECRET`, API keys, `FRONTEND_URL`, etc., per your deployment.

```bash
# Example: list keys without printing values (adjust to your tooling)
grep -E '^(MONGO_URI|REDIS_URL|NODE_ENV)=' .env
```

---

## 3. Install build dependencies and build

```bash
cd <APP_DIR>/crypto-backend   # adjust if repo root differs
npm ci
npm run build
```

Fix any build errors before continuing.

---

## 4. Stop the backend (and workers if any)

Use **your** process manager so nothing writes to Mongo/Redis during the DB step.

**systemd example:**

```bash
sudo systemctl stop <SERVICE_NAME>
# If you run stream workers:
# sudo systemctl stop crypto-worker-streams
```

**PM2 example:**

```bash
pm2 stop <backend-app-name>
```

**Docker example:**

```bash
cd <APP_DIR> && docker compose stop crypto-backend
```

---

## 5. Backup the nine legacy collections (mandatory before drop)

Pick a **timestamped** directory on the VM with enough disk space (large collections such as `market_trades` can be huge).

```bash
export TS="$(date -u +%Y%m%dT%H%M%SZ)"
export BACKUP_ROOT="<APP_DIR>/crypto-backend/.backups/legacy-cleanup/${TS}"
mkdir -p "$BACKUP_ROOT"
```

**mongodump** only those collections (adjust URI and database name if not `crypto_db`):

```bash
export MONGO_URI="${MONGO_URI:-mongodb://user:pass@host:27017/crypto_db}"

for c in coins labeled_coins cmc_labeled_coins labeled_active_coins \
         filtered_coins coin_raw_data coinmasters ohlcv_klines market_trades; do
  mongodump --uri "$MONGO_URI" --collection "$c" --out "$BACKUP_ROOT/crypto_db"
done
```

Verify backup directory is non-empty:

```bash
du -sh "$BACKUP_ROOT"
ls -la "$BACKUP_ROOT/crypto_db/crypto_db"   # BSON files per collection
```

**Rollback:** see [`legacy-cleanup-final.md`](./legacy-cleanup-final.md) section 8 (`mongorestore`).

---

## 6. Drop the nine legacy collections

Using **`mongosh`** (replace URI / database name):

```bash
mongosh "$MONGO_URI" --eval '
db = db.getSiblingDB("crypto_db");
const legacy = [
  "coins","labeled_coins","cmc_labeled_coins","labeled_active_coins",
  "filtered_coins","coin_raw_data","coinmasters","ohlcv_klines","market_trades"
];
legacy.forEach((name) => {
  const dropped = db[name].drop();
  print(name + ": " + dropped);
});
print("remaining count: " + db.getCollectionNames().length);
'
```

Confirm each collection reports `true` (dropped) or that missing collections are acceptable if already removed.

---

## 7. Redis — “start clean” for market cache (recommended)

The backend serves `GET /api/market/snapshot` from Redis key `market:v2:snapshot`. Related keys (from source):

| Key | Purpose |
|-----|---------|
| `market:v2:snapshot` | Cached snapshot JSON |
| `market:v2:build:lock` | Build lock |
| `market:v2:revision` | Revision counter |
| `market:trending` | Trending cache |
| `market:top-gainers` | Top gainers cache |
| `market:top-losers` | Top losers cache |

**Option A — targeted delete (preferred if Redis is shared with other services):**

```bash
# Example with redis-cli; use -u for TLS/rediss:// if needed
redis-cli -u "$REDIS_URL" DEL \
  market:v2:snapshot market:v2:build:lock market:v2:revision \
  market:trending market:top-gainers market:top-losers
```

**Option B — pattern delete for all `market:*` keys (review SCAN output in prod first):**

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'market:*' | xargs -r redis-cli -u "$REDIS_URL" DEL
```

**Option C — only if this Redis instance is dedicated to this app:** flush the current logical DB (often `SELECT 0`):

```bash
redis-cli -u "$REDIS_URL" FLUSHDB
```

After deletes, the next successful snapshot build will repopulate Redis (may take one cron cycle or a few minutes depending on your setup).

---

## 8. Deploy and start the backend

Copy built `dist/`, restart the service, or recreate containers — match your standard production procedure.

**systemd:**

```bash
sudo systemctl start <SERVICE_NAME>
sudo systemctl status <SERVICE_NAME>
```

**PM2:**

```bash
pm2 start <backend-app-name>
pm2 logs <backend-app-name> --lines 50
```

**Node directly (example):**

```bash
cd <APP_DIR>/crypto-backend
set -a && source .env && set +a
node dist/server.js
```

---

## 9. Smoke tests

Replace host/port with your public or internal base URL.

```bash
export BASE="http://127.0.0.1:4001"   # or https://api.example.com

curl -sf "$BASE/health" | jq .
curl -sf -o /dev/null -w "snapshot HTTP %{http_code}\n" "$BASE/api/market/snapshot"
curl -sf -o /dev/null -w "active-coins HTTP %{http_code}\n" "$BASE/api/market/active-coins"
```

- If **snapshot returns 503** briefly, wait 1–3 minutes and retry (cold Redis until `snapshotBuilder` runs).
- Optional: `GET /api/coins/batch?ids=<valid internalCoinId>` should return **200** once `coin_registry` has data.

---

## 10. Optional housekeeping

- Run index creation if your team uses it: `npm run script:create-indexes` (only if that script is part of your prod workflow).
- Confirm **no** production process still references old env flags (search server env and CI secrets).
- Archive the backup directory `$BACKUP_ROOT` to cold storage per retention policy.

---

## 11. Quick reference — legacy collections dropped

`coins`, `labeled_coins`, `cmc_labeled_coins`, `labeled_active_coins`, `filtered_coins`, `coin_raw_data`, `coinmasters`, `ohlcv_klines`, `market_trades`.

---

## 12. Incident rollback (short)

1. Stop the backend.
2. `mongorestore` from `$BACKUP_ROOT` (see `legacy-cleanup-final.md`).
3. Restore previous app version or re-deploy the previous `main` commit if needed.
4. Start the backend and verify `/health`.

---

*Customize `<APP_DIR>`, service names, and URIs for your VM. Keep this file in repo root for operators; do not put secrets in the file.*
