# Wallet/Portfolio Audit (Current Codebase)

## Scope
- Code inspected from `crypto-backend/src` with focus on:
  - `modules/portfolio/*`
  - `utils/alchemyNotify.ts`, `utils/alchemy.ts`, `utils/zerionSubscriptions.ts`, `utils/zerion.ts`
  - `services/walletEventAggregator.ts`, `websocket/server.ts`
  - `app.ts`, `server.ts`, `config/env.ts`
- This reflects current implementation behavior, not intended/future design.

## Architecture Snapshot
- Portfolio routes are mounted at `/api/portfolio`.
- Auth is required for user portfolio APIs (`/chains`, `/wallets`, `/events`, `/holdings`, `/events/refresh-status`).
- Webhook endpoints are public and signature-verified internally:
  - `POST /api/portfolio/webhooks/alchemy`
  - `POST /api/portfolio/webhooks/zerion`
- Runtime event aggregation and realtime fanout are in-memory in this process (buffer, cooldown maps, websocket subscribers).

## Address Limits and "How Many Addresses at a Time"

### What is strictly enforced in code
- `POST /wallets` accepts exactly one wallet address per request (`address: string`, `chains: string[]`).
- Wallet address is globally unique in DB:
  - `WalletAddress` has unique index on `address`.
  - Result: same address cannot be attached to multiple users.
- Service also checks `findWalletByAddress(address)` before insert and throws:
  - `"Wallet already added"` for same user.
  - `"This wallet is already monitored by another user"` for different user.

### What is not capped in code
- No explicit max wallet count per user in backend logic.
- No explicit max length for websocket `portfolio_subscribe.addresses` array.
- No explicit max `chains` length for a wallet (only validated against allowed chain ids).

### Provider-related practical limits seen in code
- Zerion subscription helper comment states dev-key constraints:
  - 1 subscription
  - max 5 wallets
  - 1-week validity
  - This is documented in code comments, not directly enforced with local validation.
- Alchemy webhook address update path supports arrays (`addresses_to_add`, `addresses_to_remove`), but current service calls add/remove one address at a time.
- JSON body parser limit is `5mb` (global express limit).

### Other count/limit behavior around wallet data
- Event listing default pagination limit is 20 (`GET /events`), not hard-clamped.
- Status refresh processes up to 20 pending events per call (`findEventsNeedingStatusRefresh(userId, 20)`).
- Alchemy transfer fetch (`alchemy_getAssetTransfers`) uses `maxCount: 0x32` (50 results per RPC call).

## Multi-Chain Behavior

### Chain sources and mappings currently active
- Chain allow-list for add-wallet validation comes from env `SUPPORTED_CHAINS` (default: `eth,polygon,arb,sol,bnb`).
- Alchemy webhook network -> internal chain mapping currently defined in `alchemyNotify.ts` for:
  - `eth`, `polygon`, `bnb`, `arb`, `opt`, `base`
- If incoming Alchemy network cannot be mapped, webhook controller uses fallback label `network` or `'unknown'` as event chain.
- Zerion webhook uses `tx.relationships.chain.id` directly as `chain`.

### Add wallet flow across chains
- `addWallet(userId, address, chains[])`:
  - Validates every requested chain is inside `SUPPORTED_CHAINS`.
  - Saves single wallet row with one address and `chains[]`.
  - For each chain in `chains[]`, tries to register address into chain-specific Alchemy webhook (if webhook id exists).
  - Registers address into Zerion tx subscription (create subscription if needed, else patch wallets).
- `removeWallet` performs inverse deregistration per chain for Alchemy and once for Zerion.

### Event aggregation "multi-chain" logic
- Raw events are buffered by key: `address:chain`.
- At flush time, aggregator checks whether same address currently has buffered events on more than one chain.
- If more than one chain is active for that address in window:
  - Event type is forced to `multi_chain_activity`.
  - Enrichment source becomes Zerion (portfolio + positions).
- If only one chain:
  - Enrichment source is Alchemy transfers for that chain.
- Cooldown is per address, but ingestion still buffers events (it logs cooldown and continues).

### Realtime delivery behavior
- Websocket portfolio subscriptions are address-based (not chain-based).
- Client receives wallet event/status/holdings-delta messages if subscribed address intersects event addresses.
- Chain context is included in payload, but filtering condition is address membership.

## Data Model and Ownership Rules

### `WalletAddress`
- Fields: `userId`, `address`, `chains[]`, `label`, timestamps.
- Indexes:
  - `{ userId: 1 }`
  - `{ address: 1 }` unique
- Important implication: one global owner per wallet address.

### `WalletEvent`
- Aggregated event record with:
  - `address`, `chain`, `type`, `rawEventCount`, optional `transactionCount`, optional `eventSummaries`
  - `activity` subdocument (tx hash, block, asset, from/to, token meta, txStatus, explorerUrl)
  - `enrichedData` source payload
- Indexes:
  - `{ userId: 1, aggregatedAt: -1 }`
  - `{ address: 1, aggregatedAt: -1 }`

### `PortfolioWebhookIdempotency`
- Unique `dedupeKey` per provider event line.
- Alchemy dedupe key includes: network + activity fingerprint + matched address.
- Zerion dedupe key includes: chainId + txHash + address.

## Security and Ingress Notes
- Raw request body is attached in `app.ts` via express `verify` hook and used by webhook signature verification.
- Alchemy webhook:
  - Uses `X-Alchemy-Signature` HMAC-SHA256.
  - If signing key for resolved chain is missing, verification is skipped with warning.
- Zerion webhook:
  - Uses certificate/timestamp/signature verification in `zerionSignature.ts`.
- Both webhook handlers return HTTP 200 immediately before async processing.

## Active vs Staged Chain System (Important)
- There is a richer `chainRegistry.ts` with:
  - alias resolution
  - Solana/EVM kind modeling
  - mixed-kind selection guard (`Solana must be monitored as its own wallet entry`)
  - chain-normalized address validation helpers
- In current runtime path, `portfolioService`/`controller` do not use this registry.
- Current add-wallet path therefore relies on simple `SUPPORTED_CHAINS` membership and lowercasing, without chain-kind-specific address validation.

## Key Risks / Gaps from Current State
- Global unique wallet address means no shared-follow scenario across users.
- No backend-enforced max wallet count per user; provider-side caps can fail later.
- Solana appears in default `SUPPORTED_CHAINS`, but active runtime address validation + notify mapping are EVM-centric in add-wallet path.
- If Alchemy signing key for a chain/network is not configured, authenticity checks are bypassed for that network.
- In-memory aggregation/fanout means horizontal scaling needs shared state or single-replica operation for strict ordering/coherence.

## Quick Recommendations
- Decide and codify wallet-count policy (e.g., per-user max, plan-tier-based max) in backend validation.
- Move add-wallet chain/address validation to `chainRegistry.ts` helpers and enforce Solana/EVM constraints consistently.
- Add explicit request caps:
  - max `chains` per wallet
  - max websocket subscribed addresses per client
- Fail closed for Alchemy webhooks when signing keys are expected in production.
- If scaling replicas, externalize portfolio buffer/fanout coordination (Redis or queue-backed aggregator).
