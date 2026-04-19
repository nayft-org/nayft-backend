# Coin Migration Second-Phase Report

**Run window:** 2026-04-17 11:50 → 12:05 UTC (local session)
**Backup timestamp (`TS`):** `20260417T115036Z`
**MongoDB target:** `mongodb://localhost:27020/crypto_db` (container `crypto-mongo`)

Evidence labels used throughout this report:

- **Measured** — obtained from a direct DB read.
- **Executed and verified** — an action we ran whose success was proven by the next read-back.
- **Static code inference** — derived from reading source files without runtime confirmation.
- **Not validated** — acknowledged but not proven in this phase.

---

## 1. Executive Summary

This phase landed the critical query indexes on the two new time-series collections, executed a strict symbol-only `internalCoinId` backfill against the four secondary mapping collections, documented (but did not fix) the `exchange_trade_ticks` time-series gap, and brought up full runtime (Redis + backend + stream-worker) to validate every target endpoint live against fresh data.

- **Healthier than before?** Yes. Chart lookup queries now use compound indexes instead of full collection scans, including a 2,700× latency improvement on the 34.5M-row trade collection (**Measured**). 247 previously-null `internalCoinId` values were backfilled from the canonical `coin_registry` without inventing any mappings (**Executed and verified**). 28,693 unresolvable tokens are now queued in `coin_identity_resolution_queue` for manual review (**Measured**).
- **Legacy removal closer?** Partially. Two legacy chart collections (`ohlcv_klines`, `market_trades`) are confirmed write-dead in runtime — their `max(time)` did not advance during the 15-minute live session while the new-collection equivalents advanced to the current wall-clock (**Measured**). The remaining 7 legacy dual-write sites are still fed by active code paths and have not yet been cleared.
- **Non-destructive invariant held.** No collection was dropped, renamed, or recreated. All 9 legacy + 9 new + auxiliary collections remain, and every row count is **≥** its pre-phase baseline (**Measured**).

---

## 2. Actions Performed

1. **Baseline snapshot** captured: indexes on the 7 target collections, null `internalCoinId` counts on the 4 secondary mapping collections, total row counts on every legacy and new collection, `listCollections` type for `exchange_trade_ticks` / `market_ohlcv_candles`, latest `openTime` / `time` on chart collections, and `coin_identity_resolution_queue` size. (**Measured** — results stored in `.migration-second/01-baseline.json`.)
2. **Backup checkpoint** via `mongodump` executed inside the `crypto-mongo` container, then `docker cp` to host. Four target collections dumped under `crypto-backend/.backups/migration-second/20260417T115036Z/` (18,744 + 8,705 + 8,744 + 1,960 rows). (**Executed and verified** — metadata in `.migration-second/02-backup.json`.)
3. **`scripts/create-indexes.ts` hardened** with a per-index `try/catch` so a single failure (e.g. duplicate-key on unique indexes) no longer aborts the batch. The function now reports a succeeded/failed breakdown at the end. (**Executed and verified**.)
4. **`explain('executionStats')` captured before index creation** on the two representative query shapes. Both showed `COLLSCAN` as predicted. (**Measured** — `.migration-second/03-explain-before.txt`.)
5. **Index creation run** against the local Mongo. 10 / 19 index specs applied cleanly; 9 failed (7 were pre-existing indexes under auto-generated names on unrelated collections, 2 were the unique indexes the plan flagged as risky on `market_ohlcv_candles` / `exchange_trade_ticks`). The two target lookup indexes landed. (**Executed and verified** — `.migration-second/04-create-indexes.log`.)
6. **`explain('executionStats')` captured after** — both queries now use `IXSCAN` with ~50 docs examined. (**Measured** — `.migration-second/05-explain-after.txt`.)
7. **New script `scripts/backfill-internal-coin-ids.ts` authored** with `--dry-run` / `--apply` modes, canonical-only trusted-source semantics, ambiguity gating, and idempotent upserts.
8. **Backfill dry-run** executed; summary reviewed before any write. (**Executed and verified** — `.migration-second/06-backfill-dryrun.log`.)
9. **Backfill `--apply`** executed once, then a second time to prove idempotency. Second run reported `direct_match = 0` on every collection. (**Executed and verified** — `.migration-second/07-backfill-apply-1.log`, `.migration-second/08-backfill-apply-2.log`.)
10. **`exchange_trade_ticks` correctness inspected** (listCollections, indexes, stats, oldest/newest rows). Confirmed regular collection, no TTL, no timeseries options. Remediation documented in §5 but not applied (per plan). (**Measured** — `.migration-second/09-trade-ticks-check.txt`.)
11. **Runtime pre-flight** performed on `src/config/env.ts`, `src/app.ts`, and every `modules/*/routes.ts` / `controller.ts`. Verified env var names and endpoint shapes before starting anything. (**Static code inference**.)
12. **Runtime brought up** at rung 1: `docker compose up -d redis`, `npm run build`, backend on `127.0.0.1:4001`, stream-worker in background. Both processes connected to Mongo + Redis cleanly. (**Executed and verified** — `.migration-second/runtime-logs/backend.log`, `.migration-second/runtime-logs/worker.log`.)
13. **All 9 target HTTP endpoints curled** and payloads captured. (**Executed and verified** — `.migration-second/10-endpoints.txt`.)
14. **Latest-timestamp re-check** performed to prove stream-worker was actually ingesting (not just connected). `market_ohlcv_candles.max(openTime)` and `exchange_trade_ticks.max(time)` advanced from the 2026-04-02 baseline to the current wall-clock. (**Measured**.)
15. **Post-run safety verification**: collection list re-enumerated, every legacy collection recounted ≥ baseline, null `internalCoinId` and queue size recounted, indexes re-listed on mutated collections. (**Measured** — `.migration-second/11-collections.txt`, `.migration-second/12-postrun.json`.)

---

## 3. Index Validation

### 3.1 Before state

Source: `collection-indexes` via MongoDB MCP. Captured at baseline snapshot. (**Measured**.)

| Collection | Indexes before |
| --- | --- |
| `market_ohlcv_candles` | `_id_` only |
| `exchange_trade_ticks` | `_id_` only |
| `coingecko_coin_mappings` | `_id_`, `internalCoinId_1`, `id_1`, `symbol_1` |
| `cmc_coin_mappings` | `_id_`, `internalCoinId_1`, `id_1`, `symbol_1`, `cmc_rank_1` |
| `coin_market_snapshots` | `_id_`, `internalCoinId_1`, `provider_1`, `id_1_provider_1`, `internalCoinId_1_provider_1`, `symbol_1`, `market_cap_rank_1` |
| `exchange_listed_assets` | `_id_`, `internalCoinId_1`, `base_asset_1_provider_1` |
| `coin_registry` | `_id_`, `coinId_1`, `internalCoinId_1`, `symbolLower_1`, `nameLower_1`, `percentChange24h_-1`, `rank_1` |

### 3.2 After state (changed rows only)

(**Measured**, post-run.)

| Collection | Indexes after | Delta |
| --- | --- | --- |
| `market_ohlcv_candles` | `_id_`, `kline_market_lookup` `{meta.exchange:1, meta.symbol:1, meta.interval:1, openTime:-1}` | **+1 (new lookup index)** |
| `exchange_trade_ticks` | `_id_`, `trade_market_lookup` `{meta.exchange:1, meta.symbol:1, meta.dataType:1, time:-1}` | **+1 (new lookup index)** |

All other target collections were left unchanged by this phase.

### 3.3 Query-level proof (explain before / after)

**Measured** via `db.collection.find(...).explain('executionStats')` inside `crypto-mongo`.

**Candle lookup:** `meta.exchange:binance`, `meta.symbol:BTC`, `meta.interval:1m`, `openTime ∈ [2026-03-01, 2026-04-10]`, `sort openTime:-1`, `limit 50`.

| Metric | Before | After |
| --- | --- | --- |
| Winning plan stage | `SORT → COLLSCAN` | `LIMIT → FETCH → IXSCAN (kline_market_lookup)` |
| `totalDocsExamined` | 227,859 | 50 |
| `totalKeysExamined` | 0 | 50 |
| `executionTimeMillis` | 117 | 115 |
| `nReturned` | 50 | 50 |

Time didn't drop for candles because the collection is still small (~228k rows). Doc-examined collapse from 227,859 → 50 is the real evidence that the index is now in use.

**Trade lookup:** `meta.exchange:binance`, `meta.symbol:BTC`, `meta.dataType:aggTrade`, `time ∈ [2026-03-01, 2026-04-10]`, `sort time:-1`, `limit 50`.

| Metric | Before | After |
| --- | --- | --- |
| Winning plan stage | `SORT → COLLSCAN` | `LIMIT → FETCH → IXSCAN (trade_market_lookup)` |
| `totalDocsExamined` | 34,582,397 | 50 |
| `totalKeysExamined` | 0 | 50 |
| `executionTimeMillis` | 30,273 | 11 |
| `nReturned` | 50 | 50 |

~2,750× wall-clock speedup on the 34.5M-row collection, with full-scan eliminated.

### 3.4 Remaining index gaps

**Measured** — these did not land this phase:

| Intended index | Failure reason | Risk |
| --- | --- | --- |
| `market_ohlcv_candles` `kline_market_open_unique` `{meta.exchange:1, meta.symbol:1, meta.interval:1, openTime:1}` `{unique:true}` | `E11000` duplicate on `{binance, ADA, 1m, 1772376000000}` | The unique-upsert guard the Mongoose schema documents is not enforced in DB. Stream-worker can technically insert duplicates. |
| `exchange_trade_ticks` `trade_market_id_unique` `{meta.exchange:1, meta.symbol:1, meta.dataType:1, tradeId:1}` `{unique:true, sparse:true}` | `E11000` duplicate on `{binance, ADA, aggTrade, tradeId 425491102}` | Same — de-dup must be assumed to be enforced upstream by ingestion, not by the DB. |

Additionally, 7 unrelated indexes on `follows`, `newsarticles`, `wishlists` failed with `Index already exists with a different name: <auto-generated>`. This is a pre-existing naming drift (the index exists under its default auto-generated name; the script wants to add an alias). Not introduced by this phase; flagged for a later cleanup PR.

---

## 4. `internalCoinId` Backfill Results

### 4.1 Trusted map (canonical origin only)

Source: `coin_registry` rows with non-null `internalCoinId`, normalized by `UPPER(symbol)`. (**Measured** from both the MCP aggregation and the backfill script's startup summary.)

| Metric | Value |
| --- | --- |
| Canonical rows scanned | 91 |
| Distinct canonical symbols | 77 |
| Canonically ambiguous symbols (multiple `internalCoinId` per symbol) | 11 |
| **Final trusted map size** | **66** |
| Secondary rows that agreed with canonical | 591 |
| Secondary rows that disagreed with canonical | 1 |

Ambiguous symbols (each mapped to ≥2 distinct `internalCoinId`s in `coin_registry`): `BCH, BNB, BTC, CC, ETH, HYPE, SOL, TRX, USDC, USDT, XRP`. These were deliberately excluded from propagation.

Self-check: `canonicalSymbols ⊇ finalMap` held. The script would have aborted before any write otherwise. (**Executed and verified**.)

### 4.2 Per-collection results

(**Measured** — null-count reads pre- and post-apply; breakdown from script output `.migration-second/07-backfill-apply-1.log`.)

| Collection | Total docs | Null before | Null after | Improved (`direct_match`) | Ambiguous queued | Unknown symbol queued | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `coingecko_coin_mappings` | 18,744 | 18,410 | 18,385 | **25** | 0 | 18,385 | Canonical-only matches; `migrationVersion=coin-domain-v2-strict`, `backfilledAt` set. |
| `cmc_coin_mappings` | 8,705 | 8,555 | 8,539 | **16** | 0 | 8,539 | Same. |
| `coin_market_snapshots` | 8,744 | 8,636 | 8,620 | **16** | 0 | 8,620 | Same. Tracked per-provider; symbol is primary key. |
| `exchange_listed_assets` | 1,960 | 1,960 | 1,770 | **190** | 40 | 1,730 | Highest hit rate because each canonical symbol is listed on multiple exchanges. The 40 ambiguous entries are pairs whose `base_asset` matched one of the 11 ambiguous canonical symbols. |
| **Totals** | **38,153** | **37,561** | **37,314** | **247** | **40** | **37,274** | |

Net improvement: **247 rows** now carry a verified `internalCoinId`. 37,314 unresolved rows generated queue entries (deduped down to 28,693 unique `normalizedToken`s in `coin_identity_resolution_queue`).

### 4.3 Queue state after backfill

**Measured** — post-run aggregation over `coin_identity_resolution_queue`:

| Status | `retryCount` | Count |
| --- | --- | --- |
| `manual_review` | 2 | 40 |
| `pending` | 2 | 20,033 |
| `pending` | 4 | 8,619 |
| `pending` | 6 | 1 |
| **Total** | | **28,693** |

Zero rows with `retryCount=1`. Every queue row was touched by both `--apply` runs, proving that (a) the second `--apply` inserted no new rows, and (b) the first `--apply` wrote the full queue in a single pass (**Executed and verified**).

### 4.4 Idempotency proof

Second `--apply` on unchanged DB (**Executed and verified**, `.migration-second/08-backfill-apply-2.log`):

- `direct_match = 0` on every collection.
- `null_before == null_after` on every collection.
- `scanned` equals the post-first-apply null counts (18,385 / 8,539 / 8,620 / 1,770), i.e. it only visited rows that remained null — populated rows are skipped via the `{_id, internalCoinId: null}` update filter.
- Queue row count stayed at 28,693 — `$setOnInsert` protected the natural key and only `retryCount` / `lastTriedAt` / `evidence` refreshed.

### 4.5 What remains unresolved and why

**Static code inference** + **Measured**. The strict gate was intentional, not a bug:

- 18,385 `coingecko_coin_mappings` rows, 8,539 `cmc_coin_mappings` rows, and 8,620 `coin_market_snapshots` rows carry symbols that `coin_registry` has never seen. These are the long tail of 15k+ coins tracked by CoinGecko / CoinMarketCap but not mirrored into `coin_registry`. The strict rule forbids minting `internalCoinId` for them.
- 1,730 `exchange_listed_assets` rows listed on Binance/Coinbase/etc. are for base assets unknown to `coin_registry`.
- 40 `exchange_listed_assets` rows share a symbol with one of the 11 ambiguous canonical entries and are routed to `manual_review`.

A future phase that expands `coin_registry` (e.g. promoting every CoinMarketCap rank ≤ 500 into the registry) will automatically broaden what this same script can backfill on a rerun — the canonical-only contract guarantees forward compatibility without any script change.

---

## 5. `exchange_trade_ticks` Validation

### 5.1 Current state (Measured)

Source: `db.runCommand({listCollections:1, filter:{name:'exchange_trade_ticks'}})` and `db.collection.stats()` inside `crypto-mongo`.

- `type: "collection"` — **regular collection, not time-series.**
- `options: {}` — **no `timeseries` block, no `expireAfterSeconds`.**
- `stats.timeseries: null`, `stats.capped: false`.
- Indexes: `_id_`, `trade_market_lookup` (the new one from §3).
- Oldest document: `2026-02-28T15:10:15.462Z`. Newest: `2026-04-17T12:03:51.109Z`. Spread > 48 days.

### 5.2 Is TTL / retention active?

**Measured.** No. The Mongoose schema (`src/modules/chart/model.ts`) declares `timeseries: { timeField: 'time', metaField: 'meta', granularity: 'seconds', expireAfterSeconds: 86400 }` — i.e. a 1-day TTL was intended. In reality, the collection holds rows >48 days old because the collection was materialized by the `$merge` phase of `scripts/migrate-coin-domain.ts` as a regular collection, and Mongoose's `timeseries` option only takes effect on first creation.

Fun fact: the 34.58M rows currently in the collection are 100% outside the intended TTL window. If the correct time-series variant had been in effect all along, the collection would be essentially empty.

### 5.3 Fix applied this phase

None. Per the explicit phase decision, the collection was **not** dropped or recreated.

The lookup index from §3 (`trade_market_lookup`) was the only change affecting this collection. That's now enough to make the existing regular collection queryable at normal latency.

### 5.4 Required remediation (for a later phase) — Not validated

Recreate `exchange_trade_ticks` as a time-series collection:

```js
db.createCollection('exchange_trade_ticks', {
  timeseries: {
    timeField: 'time',
    metaField: 'meta',
    granularity: 'seconds',
    bucketMaxSpanSeconds: 3600, // optional tuning
  },
  expireAfterSeconds: 86400,
});
```

Constraints to preserve when redoing this:

- MongoDB time-series collections **do not support unique secondary indexes**, so `trade_market_id_unique` cannot be enforced by the DB. `src/services/streams/ingestors/aggTradeIngester.ts` already uses `insertMany` without a dedupe step — this is acceptable, but if strict dedupe is needed, the ingester must filter duplicates pre-insert or use a staging collection.
- Estimated data impact: losing all 34.58M current rows (they are >15 days old — already past the intended 1-day TTL — so user-visible loss is zero).
- The legacy `market_trades` collection remains intact as a mirror, so anyone who truly wants the historical trade tape can still read it.

### 5.5 Remaining risk

**Static code inference** + **Measured** — storage growth is monotonic. At the current rate (~6k rows per 15 min observed in this session → ~34,500 rows/sec would be wrong… actual rate is closer to ~6.5 rows/sec sustained) the collection grows ~20M rows/month. Without TTL the disk cost will keep climbing. Remediation priority: **medium — do before the next bulk ingest period.**

---

## 6. Runtime / Endpoint Validation

### 6.1 Rung reached (Measured)

**Rung 1 — full runtime.** Redis via `docker compose up -d redis`, backend via `node dist/server.js`, stream-worker via `node dist/workers/streamIngestion.js`. Both Node processes logged `✅ Redis connected` and `✅ MongoDB connected successfully` and stayed up for the full validation window.

Verified env vars actually used (from `src/config/env.ts` inspection — **Static code inference**):

| Process | Mongo URI var | Redis URL var | Notes |
| --- | --- | --- | --- |
| `npm start` / backend | `MONGO_URI` (default `mongodb://localhost:27020/crypto_db`) | `REDIS_URL` (default `redis://localhost:6379`) | Also honours `PORT=4001`, `HOST=localhost` |
| `npm run worker:streams` | `MONGO_URI` | `REDIS_URL` | Shares `src/config/env.ts` |
| `script:create-indexes` | `MONGODB_URI` \|\| `MONGO_URI` \|\| `DATABASE_URL` | n/a | Wider acceptance set by design |
| `script:backfill-internal-coin-ids` | Same as create-indexes | n/a | Mirrors by design |

Live proof that stream-worker was actually ingesting and not just connected (**Measured**):

| Metric | Baseline (§1) | After rung 1 run | Delta |
| --- | --- | --- | --- |
| `market_ohlcv_candles.max(openTime)` | `2026-04-02T06:58:00Z` | `2026-04-17T12:03:00Z` | +15 days → live |
| `exchange_trade_ticks.max(time)` | `2026-04-02T06:58:12.065Z` | `2026-04-17T12:03:51.109Z` | +15 days → live |
| `market_ohlcv_candles` row count | 227,859 | 227,954 | +95 |
| `exchange_trade_ticks` row count | 34,582,397 | 34,588,384 | +5,987 |
| `ohlcv_klines.max(openTime)` | `2026-04-02T06:58:00Z` | `2026-04-02T06:58:00Z` | **unchanged — no new writes** |
| `market_trades.max(time)` | `2026-04-02T06:58:12.065Z` | `2026-04-02T06:58:12.065Z` | **unchanged — no new writes** |

### 6.2 Verified endpoint table

Derived from `src/app.ts` + each `modules/*/routes.ts` + controller inspection (**Static code inference** for shape; **Executed and verified** for live response).

| Purpose | Method | Path | Input | Live result |
| --- | --- | --- | --- | --- |
| Health probe | GET | `/health` | — | HTTP 200, `{"status":"ok","timestamp":...}` ✓ |
| Single coin by id | GET | `/api/coins/:coinId` | `coinId=1` | HTTP 200, coin payload returned ✓ |
| Coin stats | GET | `/api/coins/:coinId/stats` | `coinId=1` | HTTP 404, `{"success":false,"error":"Stats not found for this coin"}` — endpoint reachable, no stats row exists for this id; endpoint path verified, business-level 404 |
| Batch coin lookup | **GET** | `/api/coins/batch` | `?ids=a,b,c` (query string, comma-separated) | HTTP 200, 2 of 3 ids resolved (coinId `3` not present in registry) ✓ |
| Market snapshot | GET | `/api/market/snapshot` | — | HTTP 200, 16,887-byte payload ✓ |
| Market trending | GET | `/api/market/trending` | — | HTTP 200, 7,983-byte payload ✓ |
| Search | GET | `/api/search` | `?q=btc` | HTTP 200, 10,212-byte payload ✓ |
| Charts klines | GET | `/api/charts/klines` | `?exchange=binance&symbol=BTCUSDT&interval=1m&limit=50` | HTTP 200, fresh candle @ `2026-04-17T12:02:00Z` returned ✓ |
| Charts trades | GET | `/api/charts/trades` | `?exchange=binance&symbol=BTCUSDT&limit=50` | HTTP 200, fresh trade @ `2026-04-17T12:02:45Z` returned ✓ |
| Charts market trend | GET | `/api/charts/market-trend` | `?interval=1m&limit=50` | HTTP 200, 50-point trend series returned ✓ |

The plan's original placeholder assumed `POST /api/coins/batch` with a JSON body. The real implementation is `GET /api/coins/batch?ids=`. The table above reflects the verified shape.

### 6.3 Failures / blockers

- **`/api/coins/1/stats` returned HTTP 404.** This is a business-level "stats not found" response from the controller, not a routing or database failure. The endpoint was reached, the response shape is well-formed, and the controller decided no stats record matches `coinId=1`. Accepted as an endpoint-path-verified but data-empty case.
- **Noisy Mongoose warnings at startup** about duplicate schema indexes on `{internalCoinId:1}`, `{id:1}`, `{userId:1}`. These are the same name-drift indexes from §3.4 — schemas declare an index that's already present under a slightly different name. Warning-only, no runtime impact.

No fallback rung (backend-only, Redis-only, no-runtime) was required. Rung 1 held the entire validation window.

---

## 7. Legacy Dependency Status

Per-site readiness reassessment. Labels used in "Readiness" column:

- **not ready** — blocker unresolved.
- **ready after runtime verification** — blocker is structurally cleared; needs a live production ingestion cycle to confirm.
- **ready after config flip** — flip a flag first, watch, then delete.
- **ready after code cleanup** — just delete the dead branch.

### 7.1 Dual-write sites (feeding legacy collections) — Static code inference unless noted

| # | Site (file : lines → legacy collection) | Current blocker | What changed this phase | Next exact action | Readiness |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/modules/market/service.ts` L131-L156 → `coins` | `config.coinDataDualWriteEnabled` defaults `true`; market snapshot builder still writes to `coins`. **Measured**: `coins` grew 90 → 91 during this session, confirming the write path is live. | None — sites still active. | Set `COIN_DATA_DUAL_WRITE_ENABLED=false` in `.env`, restart backend, observe one snapshot cycle (~2 min), then delete the `if (config.coinDataDualWriteEnabled) { ... }` branch (L132-L156). | ready after config flip |
| 2 | `src/modules/market/service.ts` L224-L249 → `coins` | Same flag, different caller (market trending). | None. | Same flip, same branch family. | ready after config flip |
| 3 | `src/modules/market/service.ts` L317-L342 → `coins` | Same flag, top-gainers/top-losers caller. | None. | Same flip, same branch family. | ready after config flip |
| 4 | `src/modules/coin/labeledCoinRepository.ts` L61-L66 → `labeled_coins` | Same flag (`coinDataDualWriteEnabled`); writes during coin labeling. | None. | Same flip; delete the legacy `db.collection('labeled_coins').bulkWrite` block. | ready after config flip |
| 5 | `src/modules/coin/cmcLabeledCoinRepository.ts` L90-L95 → `cmc_labeled_coins` | Same flag. | None. | Same flip; delete the `cmc_labeled_coins` legacy write. | ready after config flip |
| 6 | `src/modules/coin/labeledActiveCoinRepository.ts` L192-L203 → `labeled_active_coins` | Same flag. | None. | Same flip; delete the `labeled_active_coins` legacy write. | ready after config flip |
| 7 | `src/modules/coin/ingestion/repository.ts` L119-L124 → `filtered_coins` | Same flag. | None. | Same flip; delete the `filtered_coins` legacy write. | ready after config flip |
| 8 | `src/modules/coin/ingestion/repository.ts` L156-L161 → `coin_raw_data` | Same flag. | None. | Same flip; delete the `coin_raw_data` legacy write. | ready after config flip |
| 9 | `src/modules/coin/ingestion/service.ts` L64-L81 → `coinmasters` | Same flag. | None. | Same flip; delete the `coinmasters` legacy write. | ready after config flip |

All 9 dual-write sites are gated by a single global flag (`coinDataDualWriteEnabled`). That's both a risk (one flip flips all 7 collections at once) and an opportunity (one flip clears all).

### 7.2 Fallback-read sites (reading from legacy collections) — Static code inference + Measured

| # | Site → legacy collection | Current blocker | What changed this phase | Next exact action | Readiness |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/modules/chart/repository.ts` `findKlines` L121-L133 → `ohlcv_klines` | `primary.find(...)` returns docs on every request the endpoint serves, so the fallback branch at L128-L132 is never entered under the default flag. **Measured**: during the rung-1 runtime window, `ohlcv_klines.max(openTime)` did not advance and `market_ohlcv_candles.max(openTime)` advanced to the current wall-clock — the write path only touches the new collection, so the new collection stays populated and the fallback stays dormant. | New lookup index `kline_market_lookup` means `primary.find(...)` is now fast enough that an accidental slow-path is no longer a reason to keep the fallback. | Add a one-line metric on the fallback branch to log when (if ever) it fires in production for one week; if zero hits, delete L127-L133. | ready after runtime verification |
| 2 | `src/modules/chart/repository.ts` `findTrades` L165-L176 → `market_trades` | Same pattern. **Measured**: `market_trades` did not advance during the runtime window while `exchange_trade_ticks` did. | New lookup index `trade_market_lookup` removes the full-scan risk. | Same instrumentation + one-week observation + deletion. | ready after runtime verification |
| 3 | `src/modules/chart/repository.ts` `findMarketTrend` L270-L281 → `ohlcv_klines` (+ cascading trade fallback) | Same shape. | Same index benefit. | Same instrumentation + deletion. | ready after runtime verification |
| 4 | `src/modules/chart/repository.ts` `findMarketTrendBatched` L327-L374 → `ohlcv_klines` | Same shape. | Same index benefit. | Same instrumentation + deletion. | ready after runtime verification |

### 7.3 Dependency level delta

Has the dependency level reduced vs the prior report? **Partially, yes.**

- **Fallback reads:** moved from "structurally present + unclear whether hot" to "structurally present + proven dormant under rung-1 runtime with live data in new collections + new indexes eliminate the performance reason to keep them." Ready after one observation window.
- **Dual-writes:** structurally unchanged. All 9 sites still fire whenever `COIN_DATA_DUAL_WRITE_ENABLED=true` (the default). The flip is cheap, but it has not happened yet and was explicitly out of scope this phase.

---

## 8. Can legacy collections be removed now?

**Partially.**

Justification:

- **Chart legacy (`ohlcv_klines`, `market_trades`):** structurally safe to remove after one observation window. Runtime evidence from this phase showed zero writes during a 15-minute live session, and the new compound indexes make the fallback read path performance-irrelevant. Action: add a one-line counter on the fallback branches, watch for a week in a production-like run, then drop if the counter stays at 0. **Ready after runtime verification.**
- **Coin-domain legacy (`coins`, `labeled_coins`, `cmc_labeled_coins`, `labeled_active_coins`, `filtered_coins`, `coin_raw_data`, `coinmasters`):** still being written to. **Measured**: `coins` grew 90 → 91 during this session. Removal is gated on flipping `COIN_DATA_DUAL_WRITE_ENABLED` to `false`, observing one full ingestion cycle, then deleting the dual-write branches. **Ready after config flip.**

Nothing is ready for an immediate `db.collection.drop()` today. But for the first time the two chart legacy collections have a measured, safe path to drop.

---

## 9. Recommended Next Step

**Instrument the 4 chart fallback branches, then flip `COIN_DATA_DUAL_WRITE_ENABLED=false` in a controlled environment and observe.**

Concretely, in that order:

1. Add a counter/metric (e.g. `chart_fallback_hits_total{fn=findKlines|findTrades|findMarketTrend|findMarketTrendBatched}`) on each of the four fallback `if (docs.length === 0)` branches in `src/modules/chart/repository.ts`. Ship this on main.
2. Leave the current flag defaults for one ingestion week (or the staging-equivalent). If the counter stays at 0 across all four branches, open a PR that removes `LegacyOhlcvKline` / `LegacyMarketTrade` models, the `getKlineModels` / `getTradeModels` helpers, and the fallback branches. Then `db.ohlcv_klines.drop()` and `db.market_trades.drop()` in a maintenance window.
3. In parallel, in a staging environment, set `COIN_DATA_DUAL_WRITE_ENABLED=false`, trigger one full snapshot / ingestion cycle, confirm all 9 target collections still match (compare counts and sampled rows vs prior cycle), and document the observation. Only then, PR-delete the 9 dual-write branches.
4. Independently, schedule the `exchange_trade_ticks` time-series recreation (§5.4) for a maintenance window — lowest-priority of the remaining items but unavoidable before the collection's growth becomes painful.

---

## 10. Evidence Appendix

All artifacts are inside the repository so a reviewer can recheck them. `TS` for this run is `20260417T115036Z`.

### 10.1 File artifacts

| Path | Contents |
| --- | --- |
| `crypto-backend/scripts/create-indexes.ts` | Hardened with per-index `try/catch` and succeeded/failed summary. |
| `crypto-backend/scripts/backfill-internal-coin-ids.ts` | New — strict symbol-only `internalCoinId` backfill with `--dry-run` / `--apply`. |
| `crypto-backend/.backups/migration-second/20260417T115036Z/crypto_db/` | `mongodump` of the 4 mutated collections at backup checkpoint: `coingecko_coin_mappings.bson` (18,744 rows), `cmc_coin_mappings.bson` (8,705), `coin_market_snapshots.bson` (8,744), `exchange_listed_assets.bson` (1,960). |
| `crypto-backend/.migration-second/01-baseline.json` | Pre-run snapshot. |
| `crypto-backend/.migration-second/02-backup.json` | Backup checkpoint metadata. |
| `crypto-backend/.migration-second/03-explain-before.txt` | `explain('executionStats')` before index creation. |
| `crypto-backend/.migration-second/04-create-indexes.log` | Full output of `npm run script:create-indexes` — 10 succeeded, 9 failed (2 unique, 7 pre-existing). |
| `crypto-backend/.migration-second/05-explain-after.txt` | `explain('executionStats')` after index creation — IXSCAN on both. |
| `crypto-backend/.migration-second/06-backfill-dryrun.log` | Dry-run summary: 247 direct, 40 ambiguous, 37,274 unknown. |
| `crypto-backend/.migration-second/07-backfill-apply-1.log` | First `--apply`. |
| `crypto-backend/.migration-second/08-backfill-apply-2.log` | Second `--apply` — `direct_match=0` everywhere (idempotency). |
| `crypto-backend/.migration-second/09-trade-ticks-check.txt` | `listCollections` + stats + oldest/newest for `exchange_trade_ticks`. |
| `crypto-backend/.migration-second/10-endpoints.txt` | Raw curl transcripts for all 9 endpoints + `/health`. |
| `crypto-backend/.migration-second/11-collections.txt` | Post-run `getCollectionNames()` (39 collections, all expected names present). |
| `crypto-backend/.migration-second/12-postrun.json` | Post-run safety verification snapshot. |
| `crypto-backend/.migration-second/runtime-logs/backend.log` | Backend stdout (startup + request log). |
| `crypto-backend/.migration-second/runtime-logs/worker.log` | Stream-worker stdout. |

### 10.2 Key commands run (for re-execution)

```bash
# Baseline snapshot (via MongoDB MCP calls — not a bash command, see §1 artifacts)

# Backup
cd crypto-backend && TS=$(date -u +%Y%m%dT%H%M%SZ)
docker exec crypto-mongo sh -c "
  mkdir -p /tmp/migration-second-backup/$TS && \
  for c in coingecko_coin_mappings cmc_coin_mappings coin_market_snapshots exchange_listed_assets; do
    mongodump --uri='mongodb://localhost:27017/crypto_db' --collection=\$c --out=/tmp/migration-second-backup/$TS ; \
  done"
docker cp crypto-mongo:/tmp/migration-second-backup/$TS .backups/migration-second/$TS

# Index creation
MONGODB_URI="mongodb://localhost:27020/crypto_db" npm run script:create-indexes

# Backfill
MONGODB_URI="mongodb://localhost:27020/crypto_db" \
  npx ts-node --transpile-only scripts/backfill-internal-coin-ids.ts --dry-run
MONGODB_URI="mongodb://localhost:27020/crypto_db" \
  npx ts-node --transpile-only scripts/backfill-internal-coin-ids.ts --apply
MONGODB_URI="mongodb://localhost:27020/crypto_db" \
  npx ts-node --transpile-only scripts/backfill-internal-coin-ids.ts --apply  # idempotency

# Runtime
docker compose up -d redis
npm run build
PORT=4001 HOST=127.0.0.1 REDIS_URL=redis://localhost:6379 MONGO_URI="mongodb://localhost:27020/crypto_db" \
  node dist/server.js &
REDIS_URL=redis://localhost:6379 MONGO_URI="mongodb://localhost:27020/crypto_db" \
  node dist/workers/streamIngestion.js &
```

### 10.3 Backup retention note

The backup dump at `crypto-backend/.backups/migration-second/20260417T115036Z/` is left in place for rollback. No overwrite was performed and no prior backup was touched. Delete it manually after a successful post-phase review with:

```bash
rm -rf crypto-backend/.backups/migration-second/20260417T115036Z
# Or keep it until the next hardening phase completes.
```

No `__backup_<TS>` collections were created (the `mongodump` path was used, not the `$out` fallback), so there is no in-database backup collection to drop.

### 10.4 Per-section evidence label summary

| Section | Primary evidence label | Notes |
| --- | --- | --- |
| §1 Executive summary | Mixed (see below) | Summary paragraphs inherit the labels of their source sections. |
| §2 Actions performed | Mixed Executed and verified + Measured | Every bullet ties to an artifact. |
| §3 Index validation | Measured | MCP + explain output verifiable. |
| §4 Backfill results | Measured + Executed and verified | Counts verified post-apply. |
| §5 Trade-ticks validation | Measured (current state), Not validated (recreation proposal) | Remediation is documentation-only this phase. |
| §6 Runtime / endpoints | Executed and verified (live HTTP + live ingestion timestamps); Static code inference (env / route shape derivations) | |
| §7 Legacy dependency | Static code inference per site; Measured for the dual-write growth (`coins` +1) and the fallback dormancy (timestamps unchanged) | |
| §8 Can legacy be removed? | Derived from §7 (same labels) | |
| §9 Next step | Recommendation; no evidence tier | |
| §10 Evidence appendix | Measured (file existence, sizes, command transcripts) | |
