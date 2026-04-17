# Legacy cleanup — final report (crypto-backend)

## 1. Executive summary

The coin-domain **dual-write paths**, **chart model fallbacks** to legacy Mongo collections, **migration-era schema fields** (`migratedAt`, `migrationVersion` on the affected models), and **one-off migration scripts** were removed from the codebase. After a **mongodump** of the nine legacy collections, those collections were **dropped** from the `crypto_db` database used by the Docker Mongo instance. The API now relies on **new-architecture collections** (for example `coin_registry`, `market_ohlcv_candles`, `exchange_trade_ticks`) and **Redis** for market snapshots. **TypeScript build** (`npm run build`) succeeds, and **smoke checks** against a running server returned HTTP 200 for health, market snapshot, active coins, and coin batch fetch.

## 2. What was removed vs preserved

### Removed (code)

- Environment toggles: `coinDataDualWriteEnabled`, `coinDataReadFromNewCollections`, `coinDataRequireInternalCoinId` (and related logic).
- Chart: `LegacyOhlcvKline`, `LegacyMarketTrade`, and `getKlineModels` / `getTradeModels` fallback helpers; repositories use `OhlcvKline` / `MarketTrade` only.
- Coin repository: reads from `coins` / feature-flag branches removed; reads use the `Coin` model (`coin_registry`).
- Market and ingestion: dual-writes to legacy collection names removed; `IngestResult` simplified (no `filtered_coins_count`, `coinmasters_upserted`).
- Labeled coin repositories: `db.collection(...)` dual-writes removed.
- Schemas: `migratedAt` / `migrationVersion` removed from the listed coin-domain models and `ICoin` where applicable.
- Scripts deleted: `migrate-coin-domain.ts`, `fix-ohlcv-collection.ts`, `compare-coin-duplicates.ts` (and matching `package.json` entries).

### Preserved

- New registry and market data paths: `coin_registry`, `market_ohlcv_candles`, `exchange_trade_ticks`, related mappings and ingest pipelines.
- Performance-oriented code (e.g. performance logging, indexes scripts where still referenced), non-coin features (auth, news, portfolio, etc.).

### Note on repo-wide strings

Some **route names and search segment identifiers** still use the word `coins` (for example `/api/coins`). That is **API naming**, not the dropped Mongo collection `coins`.

## 3. Database backup location

On-disk backup (host path, created before drops):

`crypto-backend/.backups/legacy-cleanup/20260417T140208Z/crypto_db/`

This directory is suitable for **`mongorestore`** if rollback is required (see section 8).

## 4. Dropped MongoDB collections (9)

The following collections were dropped in the **Docker** `crypto_db` instance (verified absent after `drop()`; **30** collections remained):

| Collection |
|------------|
| `coins` |
| `labeled_coins` |
| `cmc_labeled_coins` |
| `labeled_active_coins` |
| `filtered_coins` |
| `coin_raw_data` |
| `coinmasters` |
| `ohlcv_klines` |
| `market_trades` |

**Canonical post-cleanup list** (Docker `mongosh`, `db.getCollectionNames()`): includes `coin_registry`, `market_ohlcv_candles`, `exchange_trade_ticks`, `coin_market_snapshots`, identity/mapping collections, and application collections (users, news, etc.) — **30** total including `system.views`.

## 5. Validation

| Check | Result |
|--------|--------|
| `npm run build` (tsc) | Success |
| `GET /health` | HTTP 200 |
| `GET /api/market/snapshot` | HTTP 200 (after restart; empty Redis can yield 503 until a snapshot is built — retest after warm-up if needed) |
| `GET /api/market/active-coins` | HTTP 200 |
| `GET /api/coins/batch?ids=<internalCoinId from coin_registry>` | HTTP 200 |
| `src/`: no `db.collection('…')` for legacy names; no removed config keys / legacy chart symbols | Verified via search (see appendix) |

## 6. Risks and follow-ups

- **Cold Redis**: Market snapshot may return **503** until the snapshot builder repopulates Redis; operational playbooks should allow a short warm-up after cache flush or deploy.
- **Other environments**: If staging or production MongoDB was not part of this drop, align dumps and drops there before relying on this report alone.
- **Historical docs**: Files such as `migration-second.md` may still mention old flags for archive purposes; they are not runtime code.
- **Scripts**: `scripts/backfill-internal-coin-ids.ts` may still set `migrationVersion` for **backfill metadata** on non-dropped collections — distinct from the removed model fields on legacy coin documents.

## 7. Evidence appendix

### Grep-style verification (representative)

- No matches in `crypto-backend/src` for: `coinDataDualWriteEnabled`, `coinDataReadFromNewCollections`, `LegacyOhlcvKline`, `LegacyMarketTrade`.
- No `db.collection('…')` usage under `crypto-backend` TypeScript/JavaScript sources for the nine dropped names (broader `db.collection` may be absent entirely in `src`).

### Build

```text
cd crypto-backend && npm run build
# tsc completes with exit code 0
```

### Optional profiler / index proof (Phase 3.5)

Not executed as part of this closure. If required by governance, run your standard profiler or index checklist against `coin_registry` / chart collections and attach outputs here.

## 8. Rollback: `mongorestore`

Adjust host, port, and URI to match your environment. Example for a local Docker-published Mongo on port **27020** and database **`crypto_db`**:

```bash
mongorestore \
  --uri "mongodb://localhost:27020/crypto_db" \
  --db crypto_db \
  /home/gyan/Documents/crypto/crypto-backend/.backups/legacy-cleanup/20260417T140208Z/crypto_db/
```

Use **`--drop`** on the restore only if you intend to replace existing collections in `crypto_db` with the backup contents (destructive). Prefer restoring to a **temporary database** first for verification.

---

*Report generated for the legacy cleanup initiative. Do not treat MCP MongoDB list output as authoritative if it points at a different cluster than the Docker instance used for drops; always verify with the same connection string as the application.*
