# Portfolio module — backend design

This document describes how the **portfolio** feature is structured in `crypto-backend`: persisted models, how **wallet addresses** are stored and matched, and how **wallet events** flow from external providers through aggregation into MongoDB and optional real-time delivery over WebSockets.

---

## 1. High-level architecture

The portfolio module ties together three concerns:

| Concern | Responsibility |
|--------|------------------|
| **Wallets** | Users link EVM addresses to their account with per-wallet chain lists and optional labels. |
| **Holdings** | Cached snapshot of total value, 24h changes, and per-asset positions (sourced primarily from Zerion). |
| **Events** | On-chain activity notifications are debounced, enriched, stored as `WalletEvent` documents, and can be pushed to subscribed WebSocket clients. |

**HTTP API** is mounted at `/api/portfolio` (see `src/app.ts`). **Authenticated** routes use JWT middleware; **webhook** routes are public and rely on signature verification (Alchemy HMAC and Zerion certificate-based verification in `zerionSignature.ts`).

**Deployment topology (current rollout):** Run the API at **one replica** in production and staging until a future rollout adds shared aggregation or Redis-backed portfolio fan-out. See `docs/runbooks/portfolio-webhook-ingress-azure.md` for ingress raw-body rules on Azure.

The feature is registered in the feature system as `portfolio_tracking` (`src/modules/portfolio/featureConfig.ts`).

---

## 2. Data models (MongoDB / Mongoose)

All portfolio-specific schemas live under `src/modules/portfolio/models/`.

### 2.1 `WalletAddress`

Represents one linked wallet for a user.

| Field | Type | Notes |
|-------|------|--------|
| `userId` | `string` | Logical reference to `User` (not a Mongoose `populate` by default). |
| `address` | `string` | Stored **lowercase** on create (`repository.createWallet`). |
| `chains` | `string[]` | Chains this wallet is monitored on; must be subsets of `SUPPORTED_CHAINS` when adding. |
| `label` | `string` (optional) | User-facing label. |
| `createdAt` / `updatedAt` | `Date` | From `timestamps: true`. |

**Indexes** (`WalletAddress.ts`):

- `{ userId: 1 }`
- `{ address: 1 }`
- `{ userId: 1, address: 1 }` **unique** — one row per user per address.

### 2.2 `WalletEvent`

Aggregated activity record after webhook/poller raw signals are merged and enriched.

| Field | Type | Notes |
|-------|------|--------|
| `userId` | `string` | Owner of the wallet. |
| `address` | `string` | Wallet address involved (as resolved from the payload). |
| `chain` | `string` | Chain id for this record’s primary context. |
| `type` | enum | `token_transfer`, `native_transfer`, `contract_interaction`, `multi_chain_activity`. |
| `rawEventCount` | `number` | How many raw events were batched. |
| `transactionCount` | `number` (optional) | Distinct tx count in the batch. |
| `eventSummaries` | `string[]` | Human-readable lines (e.g. swap descriptions). |
| `enrichedData` | `Mixed` / `null` | Extra payload from Zerion or Alchemy after enrichment. |
| `aggregatedAt` | `Date` | When the aggregate was written (defaults to “now” on save). |
| `activity` | subdocument (optional) | Core tx fields: `txHash`, `blockNum`, `asset`, `value`, `fromAddress`, `toAddress`, `tokenContract`, `tokenDecimals`, `txStatus`, `explorerUrl`. |

**Indexes**: `{ userId: 1, aggregatedAt: -1 }`, `{ address: 1, aggregatedAt: -1 }` for listing and lookups.

### 2.3 `Holding`

One document per user (`userId` unique): cached portfolio snapshot.

| Field | Notes |
|-------|--------|
| `totalValue`, `absoluteChange24h`, `relativeChange24h` | Portfolio-level metrics. |
| `positions[]` | `{ name, symbol, quantity, value, chain }`. |
| `syncedAt` | Last successful sync time. |

Upserted by `portfolioRepository.upsertHoldings` when holdings are refreshed or opportunistically from the event aggregator (see below).

### 2.4 `PortfolioWebhookIdempotency`

Collection `portfolio_webhook_idempotencies`: one row per **dedupe key** so provider retries do not create duplicate downstream work.

| Field | Notes |
|-------|--------|
| `dedupeKey` | **Unique** string, e.g. `alchemy:{network}:{txHash}:{address}` or `zerion:{chainId}:{txHash}:{address}`. |
| `provider` | `alchemy` or `zerion`. |
| `createdAt` | Insert time. |

`portfolioRepository.claimWebhookIdempotencyKey` inserts before `ingestWalletEvent`; Mongo duplicate key (**11000**) means the webhook line was already accepted.

---

## 3. Repository layer

`src/modules/portfolio/repository.ts` centralizes DB access.

### 3.1 Address storage and lookup

- **Create**: `createWallet` normalizes `address` with `.toLowerCase()` before insert.
- **Lookup by user + address**: `findWalletByUserAndAddress` uses a **case-insensitive** regex so EIP-55 checksum strings in the DB still match lowercase input.
- **Lookup for webhooks** (`findWalletByAddress`): same case-insensitive strategy so Alchemy/Zerion payloads (often lowercase) resolve to the correct `WalletAddress` and thus `userId`.

### 3.2 Events

- `createEvent` — persists an aggregated `WalletEvent`.
- `findEventsByUser` — paginated (`page`, `limit`), sorted by `aggregatedAt` descending.
- `findEventsNeedingStatusRefresh` / `updateEventActivity` — support refreshing `txStatus` and `explorerUrl` from `eth_getTransactionReceipt` when still pending or unknown.

---

## 4. HTTP API surface

Defined in `src/modules/portfolio/routes.ts`, base path **`/api/portfolio`**.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/chains` | Yes | Lists supported chain ids from `SUPPORTED_CHAINS`. |
| GET | `/wallets` | Yes | Lists current user’s wallets. |
| POST | `/wallets` | Yes | Add wallet (`address`, `chains`, optional `label`). |
| DELETE | `/wallets/:id` | Yes | Remove wallet by Mongo `_id`. |
| GET | `/events` | Yes | Query `page`, `limit` for user’s events. |
| GET | `/holdings` | Yes | Holdings; `?refresh=1` or `true` forces bypass of TTL cache. |
| POST | `/events/refresh-status` | Yes | Batch-refresh pending/unknown tx statuses via Alchemy. |
| POST | `/webhooks/alchemy` | No | Alchemy Address Activity webhook receiver. |
| POST | `/webhooks/zerion` | No | Zerion tx-subscription webhook receiver. |

Controllers map Mongoose documents to DTOs in `controller.ts` (`walletToDto`, `eventToDto`).

---

## 5. Adding and removing wallets (service flow)

`src/modules/portfolio/service.ts` — `addWallet` / `removeWallet`.

### 5.1 `addWallet`

1. Rejects duplicate `(userId, address)` via `findWalletByUserAndAddress`.
2. Validates each requested chain against `config.supportedChains` (`SUPPORTED_CHAINS` env).
3. Persists with `createWallet` (address lowercased).
4. **Invalidates holdings cache** for that user (`deleteHoldingsByUser`).
5. **Alchemy Notify** (skipped when `ALLOW_PROVIDER_SUBSCRIPTION_WRITES=false`): For each chain, if `ALCHEMY_WEBHOOK_IDS` maps a webhook id, calls `alchemyNotify.updateWebhookAddresses` to **add** the address to the Address Activity webhook for that chain.
6. **Zerion** (same guard): `zerionSubscriptions.ensureSubscription` or `patchWallets` to include the address on the configured tx subscription.
7. Emits a feature event `wallet_added` via `eventService` (`portfolio_tracking`).

### 5.2 `removeWallet`

1. Loads wallet, checks `userId` ownership.
2. **Alchemy** (skipped when `ALLOW_PROVIDER_SUBSCRIPTION_WRITES=false`): Removes address from each chain’s webhook.
3. **Zerion** (same guard): Patches subscription to remove the address.
4. Deletes the `WalletAddress` row and clears holdings cache for the user.

---

## 6. How wallet events are tracked

Events are not written one-to-one from each webhook line item. They go through **`walletEventAggregator`** (`src/services/walletEventAggregator.ts`).

### 6.1 Ingress sources

1. **Alchemy webhook** (`webhookController.alchemyWebhook`)
   - Route: `POST /api/portfolio/webhooks/alchemy`.
   - Uses `req.rawBody` (attached in `app.ts` via `express.json` `verify`) for **HMAC-SHA256** verification against `X-Alchemy-Signature` when `ALCHEMY_WEBHOOK_SIGNING_KEYS` is set per chain/network.
   - Handles `type === 'ADDRESS_ACTIVITY'`.
   - Resolves `chain` from `event.network` via `alchemyNotify.getChainFromAlchemyNetwork`.
   - For each activity, finds **to** or **from** address in `WalletAddress` via `findWalletByAddress`, then **`claimWebhookIdempotencyKey`**; on success builds `WalletRawEvent` and calls `ingestWalletEvent`.

2. **Zerion webhook** (`webhookController.zerionWebhook`)
   - Route: `POST /api/portfolio/webhooks/zerion`.
   - Verifies **`X-Certificate-URL` / `X-Timestamp` / `X-Signature`** over `req.rawBody` via `zerionSignature.ts` before parsing JSON.
   - Parses `data.attributes.address` and `included[0]` transaction; **`claimWebhookIdempotencyKey`**; maps operation type to `WalletEventType`; same `ingestWalletEvent` path.

3. **`walletPoller` module** (`src/services/walletPoller.ts`)
   - Polls Alchemy `getAssetTransfers` per wallet+chain with an in-memory `lastSeenBlock` cursor.
   - **Not started** in `src/server.ts` (comment there states monitoring is webhook-driven). The poller remains available if wired manually later.

### 6.2 In-memory aggregation (debounce + buffer)

- Raw events are keyed by **`address:chain`** in a `Map` of arrays.
- First raw event for a key schedules a **flush** after `config.eventAggregationWindowMs` (`EVENT_AGGREGATION_WINDOW_MS`, default 120000 ms). Additional events for the same key coalesce in the same window (only one timer per key).
- **Cooldown**: After a successful DB write, `cooldownMap` blocks new `ingestWalletEvent` calls for that **address** until `Date.now() + config.walletEventCooldownMs` (`WALLET_EVENT_COOLDOWN_MS`, default 300000 ms).

### 6.3 Enrichment before persist

On flush:

- If the same address has buffered activity on **more than one chain** (detected by scanning other buffer keys), enrichment uses **Zerion** (`getWalletPortfolio`, `getWalletPositions`) and event type becomes `multi_chain_activity`.
- Otherwise enrichment uses **Alchemy** `getAssetTransfers` for that address+chain.
- **Opportunistic holdings update**: If the user has **exactly one** wallet and it matches the event address, multi-chain Zerion enrichment can `upsertHoldings` from Zerion positions/portfolio totals.

Then the pipeline:

1. Picks **primary** activity from the first raw event; runs `eth_getTransactionReceipt` to set `txStatus` and explorer URL.
2. Computes `transactionCount` and `eventSummaries` via helpers.
3. `portfolioRepository.createEvent(...)`.
4. Sets address cooldown; notifies **WebSocket subscribers** (see below).

### 6.4 Real-time delivery (WebSockets)

`attachWebSocketServer` (`src/websocket/server.ts`) calls `subscribeToWalletEvents` so each saved `IWalletEvent` triggers `broadcastWalletEvent`.

- Clients send `{ "type": "portfolio_subscribe", "addresses": ["0x..."] }` (addresses normalized to lowercase).
- Only clients subscribed to the event’s `address` (case-insensitive match) receive `{ type: "wallet_event", event }`.

---

## 7. Holdings (read path)

`getHoldings` in `portfolioService`:

1. Reads `Holding` for `userId`.
2. If `syncedAt` is within `holdingsCacheTtlMs` (`HOLDINGS_CACHE_TTL_MS`, default 300000 ms) and not `forceRefresh`, returns cached data — **unless** cache shows zero value and no positions (`staleZero` bypass).
3. Otherwise loads all `WalletAddress` rows for the user, calls `fetchAndAggregateHoldings` (`src/utils/holdingsAggregator.ts`) which uses Zerion per address, merges positions, then `upsertHoldings`.

---

## 8. Configuration (environment)

Relevant entries from `src/config/env.ts`:

| Variable | Role |
|----------|------|
| `SUPPORTED_CHAINS` | Comma-separated chain ids for validation and UI (`getSupportedChains`). |
| `EVENT_AGGREGATION_WINDOW_MS` | Debounce window for aggregating raw events per `address:chain`. |
| `WALLET_EVENT_COOLDOWN_MS` | Per-address suppression after one aggregated event is stored. |
| `WALLET_POLL_INTERVAL_MS` | Used by `walletPoller` if enabled (not used by default server startup). |
| `HOLDINGS_CACHE_TTL_MS` | How long `Holding` document is treated as fresh. |
| `ALCHEMY_*` | RPC, Notify API, webhook IDs, signing keys for Address Activity. |
| `ZERION_*` | API base, key, `ZERION_SUBSCRIPTION_ID` for tx subscriptions. |
| `WEBHOOK_BASE_URL` | Documented in env for public tunnel URL setup (webhook registration). |
| `ALLOW_PROVIDER_SUBSCRIPTION_WRITES` | Default `true`. When `false`, `addWallet` / `removeWallet` skip Alchemy Notify and Zerion subscription HTTP calls (Mongo wallet rows still updated). |

---

## 9. File map (quick reference)

| Path | Role |
|------|------|
| `src/modules/portfolio/models/*.ts` | Mongoose schemas: `WalletAddress`, `WalletEvent`, `Holding`, `PortfolioWebhookIdempotency`. |
| `src/modules/portfolio/zerionSignature.ts` | Zerion webhook certificate/signature verification. |
| `src/modules/portfolio/repository.ts` | DB queries and normalization helpers. |
| `src/modules/portfolio/service.ts` | Business logic: wallets, holdings, event status refresh. |
| `src/modules/portfolio/controller.ts` | HTTP handlers and DTO mapping. |
| `src/modules/portfolio/webhookController.ts` | Alchemy + Zerion HTTP ingress. |
| `src/modules/portfolio/routes.ts` | Route wiring. |
| `src/services/walletEventAggregator.ts` | Debounce, enrichment, persist, subscriber fan-out. |
| `src/services/walletPoller.ts` | Optional polling path (not started in `server.ts`). |
| `src/utils/holdingsAggregator.ts` | Zerion-backed holdings fetch/merge. |
| `src/utils/alchemyNotify.ts` | Webhook address patch + network→chain mapping (referenced by service/webhook). |
| `src/utils/zerionSubscriptions.ts` | Subscription lifecycle (referenced by service). |
| `src/websocket/server.ts` | `portfolio_subscribe` / `wallet_event` broadcast. |

---

## 10. Security notes

- Webhook endpoints must receive the **raw JSON body** for signature verification; this is why `express.json` sets `req.rawBody` in `app.ts`.
- Alchemy verification is enforced when signing keys are configured; otherwise the controller logs a warning and may skip verification (development risk).
- Zerion: requests must pass `zerionSignature.verifyZerionWebhook` (certificate fetch + RSA/EC verification). Ingress must not alter bodies; see `docs/runbooks/portfolio-webhook-ingress-azure.md`.

This file is descriptive only; for exact behavior, refer to the referenced source files.
