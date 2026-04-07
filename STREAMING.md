# Binance streaming (API + worker)

Live prices and chart ingestion use **two processes** and **Redis**:

1. **API** (`npm run dev` / `npm start`) — HTTP + WebSocket `/ws`. Subscribes to Redis channel `stream:prices:batch` and pushes batched quotes to clients that sent `subscribe`. Updates Redis `stream:price:symref` ref-counts per symbol so the worker knows which `@ticker` streams to open.

2. **Worker** (`npm run dev:worker:streams` / `npm run worker:streams`) — Connects to Binance for dynamic `<symbol>@ticker` (not `!ticker@arr`), optional kline + aggTrade, writes klines/trades to Mongo, publishes normalized price batches to Redis.

**Required:** MongoDB, Redis, and both processes for full functionality. Without the worker, WebSocket clients will not receive price updates (Redis channel stays quiet).

**Environment highlights**

- `TICKER_SYMBOLS` — baseline symbols always subscribed upstream (defaults to `KLINE_SYMBOLS`).
- `ENABLE_AGGTRADE` — `true`/`false` (default: `true` in development, `false` in production).
- `AGGTRADE_MAX_SYMBOLS` — cap aggTrade symbols (default `14`).
- `PRICE_WS_FLUSH_MS` — outbound batching interval for `/ws` (default `150`).
- `KLINE_INGEST_MAX_BUFFER`, `AGGTRADE_INGEST_MAX_BUFFER` — backpressure caps (default `50000`).

**Multi-instance API:** Each instance updates the same Redis `stream:price:symref` hash; the worker polls it and merges with `TICKER_SYMBOLS` baseline.

## Docker Compose

`docker compose up -d --build` starts Redis, MongoDB, **`backend`** (HTTP + `/ws`), and **`stream-worker`** (`node dist/workers/streamIngestion.js`). Both app services use image `nayft-backend:local` built from the `backend` service. The worker has no exposed ports; it needs the same `REDIS_URL` and `MONGO_URI` as the API (set in `environment` / `.env` for container DNS: `redis`, `mongodb`). Run a single `stream-worker` per deployment unless symbols are sharded intentionally.
