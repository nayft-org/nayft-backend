# WebSocket ingestion audit — crypto-backend

**Scope:** Ingestion only (upstream → Node.js process). Fan-out to clients is mentioned only where it affects ingestion cost (e.g. downstream work per tick).  
**Auditor role:** Production incident investigation — real-time streams, WebSockets, cloud cost.  
**Date:** 2026-04-07  

---

## Executive summary

| Finding | Severity |
|--------|----------|
| **Critical:** Upstream stream `!ticker@arr` pulls **all** Binance USDT tickers in one combined stream — not a per-symbol subscription. | **Cost / CPU / bandwidth** |
| **Critical:** App WebSocket clients with **no symbol subscription** (`subscribe` never sent or empty set) receive **every** price update (full market batch), multiplied by **number of clients**. | **Outbound bandwidth + CPU** |
| **High:** **Two** separate Binance WebSocket connections at startup: ticker stream + kline/aggTrade combined stream. | **Connection count + aggregate load** |
| **High:** `aggTrade` enabled for **~20 symbols** — message rate scales with **trades/sec**, not candles. | **CPU / Mongo / network** |
| **Medium:** `priceCache` is an unbounded `Map` (one entry per ticker symbol in the stream). | **Memory** |
| **Medium:** Kline/aggTrade ingest buffers can **grow without a hard cap** if MongoDB writes fail (events re-queued). | **Memory / backpressure** |

**Important:** This repository does **not** implement a CoinMarketCap WebSocket client. **CoinMarketCap** is used via **REST** (`src/utils/coinmarketcap.ts`) with **60s Redis cache**. Live WebSocket market data is sourced from **Binance** (`binanceWebSocket.ts`, `BinanceKlineAdapter`). If Azure cost spikes were attributed to “CMC,” verify whether that meant **CMC REST** (unlikely to spike from ingestion alone) vs **this Binance** path (which can spike hard). If the *actual* production stack uses a different CoinMarketCap WebSocket integration not present in this repo, treat this document as **Binance-only** and re-audit that branch.

---

## 1. Connection analysis

### 1.1 What exists in code

| Connection | URL / pattern | Count |
|------------|----------------|-------|
| **Ticker (live prices)** | `wss://stream.binance.com:9443/stream?streams=!ticker@arr` | **1** |
| **Kline + aggTrade** | `wss://stream.binance.com:9443/stream?streams=<sym1>@kline_1m/<sym2>@kline_1m/.../<sym>@aggTrade/...` | **1** |

Startup (`src/server.ts`): `registerAdapter('binance', new BinanceKlineAdapter())`, `startStreams()`, then `attachWebSocketServer()` and `binanceWebSocket.start()`.

**Unintentional duplicate connections:**  
- `binanceWebSocket.start()` is idempotent if the socket is already `OPEN` (`binanceWebSocket.ts` L107–109).  
- `BinanceKlineAdapter.connect()` returns early if already `OPEN` (L106–107).  
- **No** evidence of multiple ticker clients unless `start()` is invoked from elsewhere (grep shows only `server.ts`).

**Reconnect behavior:**  
- Both use exponential backoff on `close`, capped at **60s** (`binanceWebSocket.ts` L96–98; `binanceAdapter.ts` L155–157).  
- **No** jitter on first reconnect (only implicit from `Math.min(1000 * 2 ** n, ...)`).  
- On `close`, a **new** `WebSocket` is created — **no** duplicate if the previous socket fully closed (reference nulled).  
- **Retry storm risk:** moderate — if the network flaps, reconnects are staggered by backoff; if Binance returns **401/403** or persistent failure, logs will show repeated `Disconnected`/`Connected` cycles.

**Lifecycle logging:**  
- Present: `console.log` on connect/disconnect/parse errors.  
- **Missing:** structured logs (correlation id, attempt count, close code, `readyState` transitions), metrics for reconnect rate.

---

## 2. Message rate analysis

### 2.1 `!ticker@arr` (Binance combined stream)

- **Semantics:** One stream delivers **all** symbols’ **24h mini tickers** in a **single payload** (array), typically on a **~1s** cadence (Binance behavior; subject to exchange changes).  
- **Per-message work:** `JSON.parse` of a **very large** string; loop over **all** tickers; update `priceCache` for every symbol; build `updates[]`; `broadcast` to all subscribers.

**Implication:** Message **count** per second is low (often ~1/s), but **messages per second** as a *metric* understates load: **each** message is **O(n)** in **n ≈ number of listed USDT pairs** (hundreds to 1000+).

### 2.2 Kline + aggTrade combined stream

**Configured symbols** (`src/config/streamConfig.ts`):  
- Kline: default **20** symbols (`KLINE_SYMBOLS` env).  
- AggTrade: default **14** symbols (`AGGTRADE_SYMBOLS` env).  
- `startStreams()` merges into **one** union set and subscribes to **both** `kline_1m` and `aggTrade` for each (`src/services/streams/registry.ts` L24–37).

**Kline:** High update frequency per candle (not only on close).  
**AggTrade:** One message per **aggregated trade** — during volatility, **trade rate** dominates; can spike **far above** kline traffic.

### 2.3 Duplicate detection

- **Ticker path:** No deduplication by id — each payload overwrites `priceCache` and re-broadcasts. **Duplicates** are not expected from Binance; **repeated processing** of the same logical market is the cost.  
- **Trade path:** `insertMany` of trade docs — duplicates possible if replayed; **no** idempotency key in ingester visible in this audit.

---

## 3. Subscription audit

### 3.1 Upstream (Binance)

| Stream | Subscription type | “Wildcard”? |
|--------|-------------------|-------------|
| `!ticker@arr` | **Full market** (all USDT tickers) | **Yes — effectively full-market** |
| `*/@kline_1m` + `*/@aggTrade` | Per-symbol list from env | No — but **list size** defaults to **20 + 14** merged symbols |

**Verdict:** The dominant cost is **`!ticker@arr`**, not “too many pairs in kline,” unless envs are expanded to hundreds of symbols.

### 3.2 CoinMarketCap

- **REST only** in this repo — no WebSocket subscription to audit.  
- Caching: **60s TTL** on listings/quotes/trending (`coinmarketcap.ts`).

---

## 4. Processing bottleneck

### 4.1 Ticker path (`binanceWebSocket.ts`)

1. `message` → `JSON.parse` → `processTickerMessage` → full-array iteration → `priceCache.set` per symbol → `broadcast(updates)` → each subscriber runs synchronously.

2. **Downstream subscriber** (`websocket/server.ts` L85–95):  
   - For **every** tick, iterates **all** connected app clients.  
   - **`JSON.stringify`** of `{ type: 'price', updates: filtered }` **per client**.  
   - **If `symbols.size === 0`**, `filtered === updates` (**full market list**).

**Anti-patterns / inefficiencies:**  
- **Full-market upstream** + **per-client stringify** on every tick = **CPU × clients × payload size**.  
- **No** batching/coalescing of outbound sends.  
- **Synchronous** `cb(updates)` for Binance subscribers; wallet path is separate.

### 4.2 Kline/aggTrade path (`registry.ts` + ingestors)

- **Routing:** `routeEvent` → `ingestKlineEvent` / `ingestAggTradeEvent` (sync).  
- **Kline:** Buffered; `flush` uses `bulkWrite` (async `.catch()`), not awaited in hot path.  
- **AggTrade:** `insertMany` (async `.catch()`).  
- **Blocking:** Not blocking the event loop on Mongo **completion**, but **buffer growth** and **JSON.parse** on every message still cost CPU.

---

## 5. Backpressure handling

| Component | Behavior | Risk |
|-----------|----------|------|
| Binance WS `message` | No queue; **synchronous** handler | Slow handler → **implicit** TCP backpressure / buffer growth in `ws` |
| `priceCache` | Unbounded `Map` | **Memory** grows with distinct symbols |
| Kline buffer (`klineIngester.ts`) | Cap flush at `BATCH_SIZE` per flush; **no max buffer size** | On failure, events **unshift** back — **unbounded** if DB consistently fails |
| AggTrade buffer (`aggTradeIngester.ts`) | Same pattern | Same |

**Old messages:** Not dropped on purpose; **failure** path re-injects into buffer. **No** explicit drop policy under overload.

---

## 6. Memory & resource usage

- **`priceCache`:** `Map` keyed by base symbol (e.g. `BTC`) for **every** ticker in `!ticker@arr` — **large** steady-state footprint.  
- **`subscribers` / `wss.clients`:** Standard `Set`/`WeakMap` usage; **no** obvious leak from subscription maps **if** `close` fires (WeakMap for client symbols clears when WS is GC’d — **note:** `WeakMap` keys are WS objects; if references remain, they persist).  
- **Event loop lag:** Not measured in code. **High** `JSON.parse` + fan-out to many clients will cause **lag spikes**.

---

## 7. Network usage

| Direction | Dominant factor |
|-----------|-------------------|
| **Inbound (Binance)** | **Size** of `!ticker@arr` payloads + **aggTrade** volume |
| **Outbound (Azure egress)** | If many WebSocket clients with **no symbol filter**, **each** receives **full** `updates` JSON **every tick** → **egress** scales with **clients × payload** |

---

## 8. Logging & observability gaps

**Missing:**

- Counters: `ws_messages_in_total`, `ws_bytes_in_total`, `ticker_symbols_per_message`, `outbound_ws_bytes_total`, `reconnect_total`, `parse_errors_total`.  
- Histograms: `ticker_updates_per_message`, `aggtrade_events_per_second`, `client_count`, `event_loop_lag_ms` (or `perf_hooks`).  
- Logs: **close code**, **reason**, **reconnect attempt**, **first message latency** after connect.  
- Trace: single span from `message` → `broadcast` → `client.send` (sampled).

---

## Root cause hypothesis (ranked)

1. **`!ticker@arr` full-market ingestion** — Largest **CPU** (parse + iterate thousands of symbols) and **inbound bandwidth** per message. **Most likely** driver of “sudden” spikes if deploys or Binance behavior changed payload size/frequency.  
2. **Outbound amplification** — Many `/ws` clients without `subscribe.symbols` → **each** tick sends **full** `updates` array. **Strong** candidate for **Azure egress** and **CPU** (`JSON.stringify` × N).  
3. **`aggTrade` on 14 symbols** — Trade-rate spikes during volatility → **message rate** and **Mongo write** volume spike **independently** of ticker.  
4. **Second WebSocket** (kline + aggTrade) — Adds **parallel** parse + ingest load; **not** fan-out, but **additive** to process.  
5. **Mongo backpressure** — If `bulkWrite`/`insertMany` slow, **buffers** grow → **memory** spike; **secondary** unless DB is saturated.  
6. **CoinMarketCap REST** — **Unlikely** to explain ingestion spike **unless** something bypasses cache or calls **listings/quotes** at high QPS (not in this WebSocket audit path).

---

## Metrics to add immediately

1. **Inbound:** `binance_ticker_messages_total`, `binance_ticker_parse_duration_ms` (histogram), `binance_ticker_symbol_count` (histogram per message).  
2. **Kline/agg:** `binance_stream_messages_total{stream=kline|aggTrade}`, `aggtrade_events_per_second` (gauge).  
3. **Connections:** `binance_upstream_ws_connected{stream=ticker|kline_agg}`, `binance_reconnect_total{stream}`.  
4. **App WS:** `ws_clients_connected`, `ws_price_broadcast_total`, `ws_outbound_bytes_total`, `ws_clients_without_symbol_filter` (gauge).  
5. **Process:** `nodejs_heap_used_bytes`, `event_loop_delay_p99_ms` (or `perf_hooks.monitorEventLoopDelay`).  
6. **Buffers:** `kline_ingest_buffer_length`, `aggtrade_ingest_buffer_length` (gauges).

---

## Code-level issues (specific)

1. **`!ticker@arr`** — Full-market **upstream** subscription (`binanceWebSocket.ts` L3).  
2. **Default client behavior** — `symbols.size > 0 ? filter : updates` (`server.ts` L89–90) sends **full** updates when no filter → **egress** explosion.  
3. **Per-client `JSON.stringify`** on every tick (`server.ts` L92–93).  
4. **Unbounded `priceCache`** (`binanceWebSocket.ts` L13, L49).  
5. **No max buffer** on kline/aggTrade ingest buffers on persistent DB failure.  
6. **`BinanceKlineAdapter.subscribe`** disconnects and reconnects when symbols change while open (`binanceAdapter.ts` L172–178) — **correct** for URL change, but **no** debounce if called in a loop (not currently called repeatedly from registry).  
7. **CoinMarketCap** — Not used for WebSocket; **no** CMC WS code path to audit here.

---

## Quick fixes (high impact)

1. **Replace `!ticker@arr`** with **explicit symbol list** streams (e.g. `btcusdt@ticker/ethusdt@ticker/...`) capped to **symbols you actually serve**, or use **MINI_TICKER** / **BOOK_TICKER** only if product allows.  
2. **Require** explicit `subscribe` before price pushes — or default to **empty** (no price push) instead of **full market**.  
3. **Coalesce** outbound price messages (e.g. 100–250ms **tick batch** per client) to cut `JSON.stringify` and packets.  
4. **Trim `aggTrade`** symbols in env to the minimum needed for charts; or **disable** aggTrade in staging until metrics exist.  
5. **Cap** `priceCache` to **union of symbols** clients need + LRU eviction for safety.  
6. **Cap** kline/agg buffers with **drop-oldest** or **sample** under pressure (log when dropping).

---

## Architecture fixes (long term)

1. **Separate ingestion from fan-out:** Dedicated worker or sidecar for Binance → Redis/pub-sub or internal queue; API nodes only read **pre-aggregated** snapshots.  
2. **Normalize** on one stream type per concern (ticker vs trades vs klines).  
3. **Idempotent** trade writes (`tradeId` + exchange unique index).  
4. **Azure:** Place **ingress-heavy** workloads in region with Binance; measure **egress** separately from **ingress** (Log Analytics / NSG flow / app metrics).  
5. If product **requires** CoinMarketCap WebSocket in the future, **do not** duplicate Binance + CMC for the same symbols without a **single** normalization layer.

---

## Sample instrumentation (Node.js)

**Lightweight counters + histogram (drop into `binanceWebSocket.ts` message handler):**

```typescript
import { performance } from 'perf_hooks';

// Simple counters (replace with Prometheus / OpenTelemetry in prod)
const metrics = {
  tickerMessagesIn: 0,
  tickerBytesIn: 0,
  tickerSymbolCount: [] as number[], // or a histogram
  parseErrors: 0,
};

function recordTickerMessage(raw: Buffer | string): void {
  const buf = typeof raw === 'string' ? Buffer.from(raw) : raw;
  metrics.tickerMessagesIn += 1;
  metrics.tickerBytesIn += buf.length;
}

// Inside ws.on('message'):
//   recordTickerMessage(raw);
//   const t0 = performance.now();
//   const data = JSON.parse(...);
//   const updates = processTickerMessage(data);
//   recordHistogram(performance.now() - t0, 'ticker_process_ms');
//   metrics.tickerSymbolCount.push(updates.length); // sample last N only
```

**Reconnect logging:**

```typescript
ws.on('close', (code, reason) => {
  console.error(JSON.stringify({
    event: 'binance_ticker_ws_close',
    code,
    reason: reason.toString(),
    reconnectAttempts,
  }));
  // ...
});
```

**Event loop lag (startup, once):**

```typescript
import { monitorEventLoopDelay } from 'perf_hooks';
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  const p99 = h.percentile(99);
  console.log(JSON.stringify({ event: 'event_loop_lag_p99_ms', value: p99 / 1e6 }));
  h.reset();
}, 60000);
```

**Client `/ws` guard (conceptual):** only call `client.send` for price if `symbols.size > 0` **or** feature flag allows broadcast (avoid accidental full-market).

---

## Bonus: rate limiting, batching, subscriptions, pooling

| Technique | Application |
|-----------|------------|
| **Rate limiting** | Limit **connections per IP** on `/ws`; limit **subscribe** message frequency per client. |
| **Message batching** | Batch **price** updates per client every **N ms**; merge **Map** of symbol → last tick. |
| **Subscription optimization** | **Remove** `!ticker@arr`; use **only** `stream?streams=...` for required `symbol@ticker`. |
| **Connection pooling** | **Single** Binance connection per **process** (already true for ticker); **do not** spawn per user; **horizontally** scale **API** nodes only **after** upstream is **symbol-filtered**. |

---

## File reference (ingestion)

| File | Role |
|------|------|
| `src/services/binanceWebSocket.ts` | Binance `!ticker@arr`, `priceCache`, reconnect |
| `src/websocket/server.ts` | App `/ws`, symbol filter, **broadcast** to clients |
| `src/services/streams/adapters/binanceAdapter.ts` | Kline + aggTrade combined stream |
| `src/services/streams/registry.ts` | `startStreams`, symbol union, `routeEvent` |
| `src/services/streams/ingestors/klineIngester.ts` | Mongo `bulkWrite` batching |
| `src/services/streams/ingestors/aggTradeIngester.ts` | Mongo `insertMany` batching |
| `src/config/streamConfig.ts` | `KLINE_SYMBOLS`, `AGGTRADE_SYMBOLS`, retention |
| `src/utils/coinmarketcap.ts` | **REST only** — not WebSocket |

---

*End of audit.*
