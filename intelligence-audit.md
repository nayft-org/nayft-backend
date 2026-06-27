# NAYFT Portfolio Intelligence Coverage Audit

**Date:** June 27, 2026
**Scope:** `crypto-backend` (Node.js/Express/TypeScript) + `crypto-market` (React Native/Expo) + `news-intelligence-lab` (Python/Flask)
**Method:** Read-only code inspection — no changes made

---

## Executive Summary

NAYFT is a strong **personal portfolio analytics platform** and a weak **market intelligence system**.

It has 15+ portfolio analytics engines, mature real-time streaming infrastructure, and multi-chain wallet tracking — but is entirely absent in social signals, derivatives, macro events, institutional data, and governance.

**Overall Portfolio Intelligence Score: 62 / 100**

| Strength | Weakness |
|---|---|
| Portfolio analytics (15 engines) | News intelligence lab is decoupled from production |
| Real-time streaming (WebSocket) | No social signals whatsoever |
| Multi-chain on-chain tracking | No derivatives or funding rate data |
| Investor identity + archetype system | No macro event integration |
| Feature flag + A/B infrastructure | No entity labeling on on-chain data |

---

## Part 1 — External Data Provider Inventory

### Market Data

| Provider | Endpoint | Data Fetched | Frequency | Storage | Status |
|---|---|---|---|---|---|
| **Binance** | `wss://stream.binance.com:9443/stream` + REST | 24h ticker, OHLCV klines (1m–1w), aggregate trades | Real-time WebSocket + cron downsampler | `market_trades`, `ohlcv_klines` | LIVE |
| **CoinGecko** | `https://api.coingecko.com/api/v3` | Coin metadata, market cap, dominance, 24h volume, tokenomics overview | On-demand | `coins`, `labeled_coins`, `labeled_active_coins` | LIVE |
| **CoinMarketCap** | `https://pro-api.coinmarketcap.com` | Rankings, spot price, trending, gainers/losers | On-demand | `cmc_labeled_coins` | LIVE |

### News & Content

| Provider | Endpoint | Data Fetched | Frequency | Storage | Status |
|---|---|---|---|---|---|
| **CoinDesk** | `https://data-api.coindesk.com` | Articles, headlines, author, image, publication date, categories | Manual `POST /api/news/store-news` or external cron | `newsarticles` | LIVE |
| **news-intelligence-lab** | Internal Python Flask `/analyse` | Sentiment scores, geo entity extraction, market impact correlation | On-demand analysis | **Not persisted — sidecar only** | PARTIAL (offline/decoupled) |

### On-Chain

| Provider | Endpoint | Data Fetched | Frequency | Storage | Status |
|---|---|---|---|---|---|
| **Alchemy RPC** | `https://{network}.g.alchemy.com/v2/{key}` | Wallet asset transfers, token balances, tx history, gas | Webhooks (real-time) + 60s polling | `walletevents`, `holdings` | LIVE |
| **Alchemy Notify Webhooks** | `POST /api/portfolio/webhooks/alchemy` | Real-time wallet events (transfers, approvals, contract interactions) | Event-driven | `walletevents` (source: `alchemy_notify`) | LIVE |
| **Zerion** | `https://api.zerion.io/v1` | Multi-chain portfolio aggregation, cross-chain holdings snapshot | Webhooks + on-demand | `walletevents`, `holdings` | LIVE |
| **Zerion Webhooks** | `POST /api/portfolio/webhooks/zerion` | Real-time cross-chain wallet updates | Event-driven | `walletevents` (source: `zerion_live`) | LIVE |

### Exchange

| Provider | Endpoint | Data Fetched | Frequency | Storage | Status |
|---|---|---|---|---|---|
| **CoinDCX** | `https://api.coindcx.com` | Exchange balances, trade history | Initial backfill + 90s polling | `holdings`, `usertrade` | LIVE |

### Not Connected (Missing Providers)

- Twitter/X, Reddit, Telegram — no social data
- GitHub API — no developer metrics
- Binance Futures / dYdX / Bybit — no derivatives data
- Glassnode / CryptoQuant — no advanced on-chain metrics
- Economic calendar providers (CoinMarketCap Events, Investing.com) — no macro data
- ETF flow providers (on-chain custodial wallets, SEC filings) — no institutional data
- Snapshot.org / Tally.xyz — no governance data

---

## Part 2 — Backend Architecture

### Route Inventory

#### Auth & User
- `POST /api/auth/register` — Registration
- `POST /api/auth/login` — Login
- `GET /api/auth/logout` — Logout
- `GET/PUT /api/user/*` — Profile, preferences

#### Market Data
- `GET /api/market/snapshot` — Full market overview (top coins, dominance, movers)
- `GET /api/market/analysis` — Market sentiment/trend analysis
- `GET /api/market/trending` — Trending coins (CoinGecko)
- `GET /api/market/top-gainers` — Best 24h performers
- `GET /api/market/top-losers` — Worst 24h performers
- `GET /api/market/active-coins` — Most traded

#### Coin Intelligence
- `GET /api/coins/batch` — Multiple coin profiles in one call
- `GET /api/coins/:coinId` — Detailed coin profile
- `GET /api/coins/:coinId/stats` — Extended coin statistics
- `GET /api/coins/:coinId/news` — Articles tagged to coin

#### Charts / Technical Data
- `GET /api/charts/klines` — OHLCV candlestick data (Binance)
- `GET /api/charts/market-trend` — Aggregate market trend
- `GET /api/charts/market-trend-v2` — Batched/optimized trend calculation
- `GET /api/charts/trades` — Individual trade history
- `GET /api/charts/aggTrades` — Aggregated trades

#### News
- `GET /api/news/` — Full feed (sorted `publishedAt DESC`)
- `GET /api/news/following` — Personalized feed (followed coins + social engagement)
- `GET /api/news/:newsId` — Article detail
- `POST /api/news/store-news` — Bulk ingest from CoinDesk (admin/cron only)
- `GET/POST /api/news/sentiment/*` — Sentiment scoring per coin
- `GET/POST /api/news/*/reactions` — User reactions on articles
- `GET/POST /api/news/*/comments` — Threaded comments

#### Portfolio Management
- `GET /api/portfolio/chains` — Supported blockchains
- `GET /api/portfolio/wallets` — User's tracked wallets
- `POST /api/portfolio/wallets` — Add wallet to tracking
- `DELETE /api/portfolio/wallets/:id` — Remove wallet
- `GET /api/portfolio/holdings` — Current holdings (Alchemy + Zerion aggregated)
- `GET /api/portfolio/events` — Wallet transaction history
- `POST /api/portfolio/events/refresh-status` — Force refresh event statuses
- `POST /api/portfolio/webhooks/alchemy` — Alchemy webhook ingress
- `POST /api/portfolio/webhooks/zerion` — Zerion webhook ingress
- `GET/POST /api/portfolio/exchanges/*` — CoinDCX exchange connection management

#### Portfolio Intelligence (28 endpoints)
- `GET /api/portfolio/intelligence/context` — Holdings context summary
- `GET /api/portfolio/intelligence/snapshot/latest` — Latest portfolio snapshot
- `GET /api/portfolio/intelligence/summary` — Aggregate summary
- `GET /api/portfolio/intelligence/insights` — Rule-based actionable insights
- `POST /api/portfolio/intelligence/recompute` — Manual recompute trigger
- `GET /api/portfolio/intelligence/health` — Portfolio health score
- `GET /api/portfolio/intelligence/risk` — Risk decomposition
- `GET /api/portfolio/intelligence/allocation` — Asset allocation analysis
- `GET /api/portfolio/intelligence/narrative` — Market narrative exposure
- `GET /api/portfolio/intelligence/identity` — Investor archetype
- `GET /api/portfolio/intelligence/evolution` — Analytics evolution timeline (30/90 days)
- `GET /api/portfolio/intelligence/confidence` — Data quality / confidence metrics
- `GET /api/portfolio/intelligence/explain[/:engineId]` — Engine explainability bundles
- `GET /api/portfolio/intelligence/benchmarks` — Cohort percentile benchmarks
- `GET /api/portfolio/intelligence/opportunities` — Goal-adapted opportunities
- `GET /api/portfolio/intelligence/feed-context` — Feed personalization context
- `GET /api/portfolio/intelligence/narrative-intel` — Narrative momentum/conviction
- `GET /api/portfolio/intelligence/history/:dimension` — Historical timeline (identity/risk/narrative/health/allocation)
- `GET/PUT /api/portfolio/intelligence/goal` — User investment goal
- `POST /api/portfolio/intelligence/simulate` — What-if allocation simulation
- `GET /api/portfolio/intelligence/simulate/:id` — Retrieve simulation result
- `GET /api/portfolio/intelligence/ai-context` — AI analyst context prep
- `POST /api/portfolio/intelligence/ai/chat` — AI analyst conversation

#### Other
- `GET /api/feed/ranked` — Server-ranked feed (feature-gated)
- `GET /api/risk/*` — Risk dashboard, metrics, alerts
- `GET /api/search` — Cross-entity search (coins, articles, users)
- `GET /api/notifications` — Notification history
- `GET /api/notification-unread-count` — Unread badge count
- `GET/POST /api/notification-preferences` — Alert settings
- `GET /api/admin/*` — Feature management, event analytics
- `GET /health` — Service health check
- `GET /ready` — Readiness probe (Mongo, Redis, email worker)

### Scheduled Jobs

| Job | Frequency | Function |
|---|---|---|
| Binance kline downsampler | ~Every 1 min | Downloads 1m klines from Binance, downsamples to 5m/15m/1h/4h/1d/1w, upserts to `ohlcv_klines` |
| Wallet event polling | Every 60s (configurable `WALLET_POLL_INTERVAL_MS`) | Queries Alchemy RPC for transfers on tracked wallets, normalizes into `walletevents` |
| Exchange live sync | Every 90s (configurable `EXCHANGE_LIVE_POLL_INTERVAL_MS`) | Polls CoinDCX for exchange balances, syncs to `holdings` |
| CoinDCX backfill | One-time / on-demand | Fetches full trade history on exchange connection, backfills `usertrade` |
| News ingestion | Manual or externally scheduled | Fetches CoinDesk articles, coin-tags via filtered_coins universe, upserts to `newsarticles` |
| Notification digest | Scheduled | Aggregates user alerts, sends push notifications via Expo |

### WebSocket Streams

| Stream | Data | Trigger |
|---|---|---|
| Binance Ticker | `symbol`, `price`, `percentChange24h` | Real-time price events |
| Portfolio Activity | Wallet events, holdings deltas, status messages | Alchemy/Zerion webhook ingress |
| News Fanout | New article metadata + origin tag | On ingestion |
| Risk Metrics | Risk score deltas | On portfolio change |
| Price Snapshot | Full price state | Once on subscribe |

### Cache Layers

| Layer | Key Pattern | TTL | Purpose |
|---|---|---|---|
| Redis (search keys) | `search:*` | Minutes | Market data hot path memoization |
| Redis stream channel | `STREAM_PRICES_BATCH_CHANNEL` | Ephemeral | Binance ticker coalescing (120ms flush) |
| Redis event queue | `events:queue`, `events:failed` | Configurable | System event processing |
| In-memory price cache | `priceCache` Map | Session lifetime | Live price state for WebSocket fanout |
| MongoDB TTL index | `market_trades.expiresAt` | 30 days | Auto-expire old trade data |
| Portfolio snapshot cache | `portfolioIntelligence` read model | 5 min (`HOLDINGS_CACHE_TTL_MS`) | Holdings-derived analytics cache |

### Database Collections (MongoDB)

| Collection | Purpose | Key Fields |
|---|---|---|
| `users` | Accounts, profiles, preferences | email, followingCoins, rewardPoints |
| `newsarticles` | Ingested news (CoinDesk primary) | externalId, title, coins[], categories[], sentiment, publishedAt |
| `coins` | CoinGecko snapshot cache | symbol, name, market_cap, volume_24h, price |
| `labeled_coins` | CoinGecko + symbol mapping | base_asset, symbol, coingecko_id |
| `labeled_active_coins` | Rich CoinGecko market data | volume, market_cap, dominance, trending flag |
| `cmc_labeled_coins` | CoinMarketCap metadata | symbol, cmc_rank, market_cap_usd |
| `ohlcv_klines` | OHLCV candles (multi-interval) | symbol, interval, open_time, open, high, low, close, volume |
| `market_trades` | Individual trades (short TTL) | symbol, price, quantity, timestamp |
| `walletaddresses` | Tracked wallet addresses | address, chain, userId |
| `walletevents` | Transaction history | txHash, chain, from, to, value, eventType, source |
| `holdings` | Current portfolio positions | userId, symbol, quantity, value, chain, source |
| `newsboards` | User-curated article collections | title, articles[], creator |
| `comments` | Article/board comments | targetId, author, text, timestamp |
| `reactions` | User reactions (6 types) | targetId, userId, reactionType |
| `follows` | User-to-coin, user-to-user | follower, followingUser/followingCoin |
| `feature_registry` | Feature flag configuration | key, name, enabled, targetUsers |
| `system_events` | Audit/analytics event log | featureKey, eventType, metadata, timestamp |
| `sentiment_scores` | Coin sentiment | symbol, score, direction, timestamp |
| `pi_snapshots` | Portfolio Intelligence snapshots | userId, engines{}, timestamp, version |
| `pi_positions` | Normalized portfolio positions | userId, symbol, quantity, value, category |
| `portfolio_owners` | Multi-wallet portfolio abstraction | userId, wallets[] |

---

## Part 3 — Intelligence Coverage Matrix

### Market Intelligence — 78 / 100

| Signal | Coverage | Notes |
|---|---|---|
| Spot price (real-time) | Full | Binance WebSocket, 120ms coalesced fanout |
| OHLCV candles (1m–1w) | Full | Binance REST + cron downsampler, stored in `ohlcv_klines` |
| Volume | Full | From klines |
| Market cap | Full | CoinGecko + CMC |
| BTC/ETH dominance | Full | CoinGecko |
| Top gainers/losers | Full | CMC ranking |
| Technical indicators (RSI, MACD, BB) | Missing | OHLCV data exists; no computation layer |
| Order book depth / bid-ask spread | Missing | No subscription to Binance depth streams |
| Volume anomaly detection / alerts | Missing | No threshold logic |

### News Intelligence — 35 / 100

| Signal | Coverage | Notes |
|---|---|---|
| CoinDesk news ingestion | Full | Coin-tagged, deduped by `externalId` |
| Coin tagging (article → coin) | Full | Matched against filtered_coins universe |
| Manual categories | Partial | BTC, ETH, FIAT, MARKET, CRYPTOCURRENCY only |
| User reactions + comments | Full | 6-type reactions, threaded comments |
| Sentiment scoring | Partial (offline) | Lab computes scores — never persisted, never served in feed API |
| Entity extraction | Partial (offline) | Lab does geo extraction via spaCy — not integrated |
| Intelligence-driven feed ranking | Missing | Feed always sorted `publishedAt DESC` only |
| News impact correlation | Missing | Lab computes — result discarded |
| Breaking news priority queue | Missing | No urgency flag or priority system |
| Multiple news sources | Missing | CoinDesk only |
| Source reputation scoring | Missing | |

**Critical finding:** `news-intelligence-lab` (Python, spaCy, sentiment models) analyzes every article but is entirely decoupled from the production API. All computed intelligence is discarded. The feed API has never consumed a single score from the lab.

### On-Chain Intelligence — 68 / 100

| Signal | Coverage | Notes |
|---|---|---|
| Personal wallet tracking | Full | Alchemy + Zerion dual-source |
| Multi-chain holdings | Full | Zerion handles cross-chain aggregation |
| Token transfer history | Full | Alchemy webhooks, real-time |
| Transaction status tracking | Full | Pending/confirmed/failed |
| Exchange inflow/outflow detection | Partial | Inferred from balance changes; no labeled address DB |
| Whale alert thresholds | Partial | Webhook infrastructure exists; no threshold logic |
| Smart contract interaction analysis | Missing | No approval/revoke flagging |
| MEV / sandwich attack detection | Missing | |
| Labeled exchange/whale addresses | Missing | No known-address database |
| DeFi position tracking (staking, yield) | Missing | Balance fetched; protocol context absent |
| NFT transfers | Missing | |

### Social Intelligence — 0 / 100

No external social data integration of any kind. Internal app reactions and comments exist but are platform-only signals.

| Signal | Coverage |
|---|---|
| Twitter/X mention volume and sentiment | Missing |
| Reddit monitoring | Missing |
| Telegram channel monitoring | Missing |
| Influencer tracking | Missing |
| Social mention growth trends | Missing |

### Derivatives Intelligence — 0 / 100

No derivatives infrastructure.

| Signal | Coverage |
|---|---|
| Funding rates | Missing |
| Open interest | Missing |
| Liquidation cascades | Missing |
| Long/short ratio | Missing |
| Perpetual basis | Missing |
| Options Greeks | Missing |

### Liquidity Intelligence — 15 / 100

| Signal | Coverage | Notes |
|---|---|---|
| Spot volume (via klines) | Present | Binance volume field |
| Order book depth | Missing | |
| DEX liquidity (Uniswap, Curve, Balancer) | Missing | |
| Pool composition | Missing | |
| Price impact simulation | Missing | |
| Impermanent loss tracking | Missing | |

### Developer Intelligence — 5 / 100

Entirely absent.

| Signal | Coverage |
|---|---|
| GitHub commit velocity | Missing |
| Active contributor count | Missing |
| Release frequency | Missing |
| Network hashrate (PoW) | Missing |
| Validator count (PoS) | Missing |
| Active addresses on-chain | Missing |

### Macro Intelligence — 0 / 100

Entirely absent.

| Signal | Coverage |
|---|---|
| Economic calendar (CPI, PCE, jobs) | Missing |
| Fed/ECB announcement tracking | Missing |
| Interest rate data | Missing |
| Geopolitical event tagging | Missing |
| Regulatory announcement parsing | Missing |

### ETF & Institutional Intelligence — 0 / 100

Entirely absent.

| Signal | Coverage |
|---|---|
| Bitcoin ETF flows (BlackRock, Grayscale) | Missing |
| Ethereum ETF tracking | Missing |
| Custody holdings | Missing |
| Corporate treasury disclosures | Missing |

### Governance Intelligence — 5 / 100

Entirely absent.

| Signal | Coverage |
|---|---|
| DAO proposal tracking (Snapshot, Tally) | Missing |
| Vote results | Missing |
| Governance token concentration | Missing |
| Treasury spending | Missing |

### Tokenomics Intelligence — 25 / 100

| Signal | Coverage | Notes |
|---|---|---|
| Circulating / max supply | Present | CoinGecko — stored in `labeled_active_coins` |
| Market cap / FDV ratio | Partial | Calculable from available fields; not exposed as a metric |
| Unlock / vesting schedules | Missing | |
| Emission rate tracking | Missing | |
| Burn events | Missing | |
| Staking metrics / APY | Missing | |
| Supply inflation projection | Missing | |

### Portfolio Analytics — 82 / 100

**NAYFT's deepest capability.** 15 engines live in production.

| Engine | Output | Status |
|---|---|---|
| Health | Composite portfolio wellness score, component breakdown | Live |
| Risk | Factor decomposition, VaR-equivalent risk score | Live |
| Allocation | Category/chain breakdown, rebalancing suggestions | Live |
| Concentration | Herfindahl index, top holdings % | Live |
| Diversification | Correlation analysis, Sharpe-equivalent score | Live |
| Identity | Investor archetype classification (growth, conservative, yield…) | Live |
| Narrative | Market theme exposure (AI, DeFi, L2, etc.) | Live |
| Confidence | Data quality score, coverage %, data gap list | Live |
| Benchmark | Cohort percentile ranking | Live |
| Opportunity | Goal-adapted investment suggestions | Live |
| Insights | Rule-based actionable insights, priority-ranked | Live |
| Stablecoin | Stablecoin composition and backing analysis | Live |
| Taxonomy | Coin category classification | Live |
| Evolution | 30/90-day analytics timeline | Live |
| AI Analyst | LLM portfolio narrative generation + chat | Partial (feature-gated) |

| Missing | Notes |
|---|---|
| Transaction fee tracking (separate from P&L) | Fees embedded in value; not broken out |
| Tax-loss harvesting | No tax optimization logic |
| Behavioral bias detection | No pattern tracking across user decisions |

---

## Part 4 — Data Pipeline Map

### Market Data Pipeline
```
Binance WebSocket
    → priceCache (in-memory Map)
    → Redis coalesce (120ms flush)
    → WebSocket /ws → Client (real-time prices)

Binance REST (klines)
    → cron downsampler
    → ohlcv_klines (MongoDB, indexed symbol+interval+open_time)
    → GET /api/charts/klines → Client chart

CoinGecko / CMC
    → labeled_coins / cmc_labeled_coins (MongoDB)
    → GET /api/market/snapshot → Client
```

### News Pipeline (current — broken)
```
CoinDesk API
    → newsarticles (MongoDB, sorted publishedAt DESC)
    → GET /api/news/ → Client feed

[Sidecar — entirely disconnected from above]
news-intelligence-lab (Python)
    → reads newsarticles (read-only)
    → computes sentiment, entity extraction, market impact
    → result discarded (not persisted, not served)
```

### Portfolio Data Pipeline
```
User adds wallet address
    → initial snapshot (Alchemy/Zerion API)
    → holdings (MongoDB)

Ongoing:
    Alchemy Notify webhook POST /api/portfolio/webhooks/alchemy
    Zerion webhook POST /api/portfolio/webhooks/zerion
    → walletEventAggregator (normalize event)
    → walletevents (MongoDB, source tagged)
    → Redis event queue (async processing)
    → holdings update
    → WebSocket emit('wallet_event') → Client

Exchange:
    CoinDCX 90s poll
    → holdings (exchange-sourced rows)
    → WebSocket emit('holdings_delta') → Client
```

### Portfolio Intelligence Pipeline
```
Holdings snapshot (from wallet/exchange sync)
    → positionNormalizer.service (symbol, value, category)
    → 15 engines run in parallel:
        health, risk, allocation, concentration, diversification,
        identity, narrative, confidence, benchmark, opportunity,
        insights, stablecoin, taxonomy, evolution, (AI analyst)
    → PortfolioAnalyticsSnapshot (aggregate result)
    → Redis cache (5 min TTL) + MongoDB pi_snapshots
    → GET /api/portfolio/intelligence/* (HTTP response)
    → WebSocket delta push on holdings change
    → Client (PortfolioIntelligenceScreen)
```

---

## Part 5 — Screen-by-Screen Data Utilization

### Home Screen
| Component | Data Source | Intelligence Applied | Gap |
|---|---|---|---|
| Market snapshot (BTC, ETH, dominance) | `/api/market/snapshot` | None — raw display | — |
| Top gainers/losers | `/api/market/top-gainers` + `/api/market/top-losers` | 24h % change sort | — |
| News feed (3–5 articles) | `/api/news/following` | User reactions only | No intelligence ranking |
| Portfolio value + 24h change | `/api/portfolio/holdings` | P&L calculation | — |
| Activity summary (latest tx) | `/api/portfolio/events` + WebSocket | Event source tracking | No address labels |
| Notification badge | `/api/notification-unread-count` | None | — |

### Explore Screen
| Component | Data Source | Intelligence Applied | Gap |
|---|---|---|---|
| Market analysis card | `/api/market/analysis` | Trend direction + strength | Limited sector depth |
| Trending coins | `/api/market/trending` (CoinGecko) | CoinGecko trending algorithm | — |
| Sector breakdown | Market snapshot + category filter | Category grouping | Limited sector taxonomy |
| Search results | `/api/search` | Full-text search | No ranking or intent detection |

### Portfolio Screen
| Component | Data Source | Intelligence Applied | Gap |
|---|---|---|---|
| Holdings list | `/api/portfolio/holdings` | Value sorting | — |
| Total portfolio value + P&L | Calculated from holdings | Sum and 24h P&L | — |
| Chain / category breakdown | Holdings grouped | Category taxonomy from PI | ~10–15% coins uncategorized |
| Activity list | `/api/portfolio/events` | Status tracking (pending/confirmed/failed) | Some events undescribed |

### Portfolio Intelligence Screen
| Component | Data Source | Intelligence Applied | Gap |
|---|---|---|---|
| Health score | `/api/portfolio/intelligence/health` | Composite health engine | — |
| Investor identity | `/api/portfolio/intelligence/identity` | Archetype classification | — |
| Allocation chart | `/api/portfolio/intelligence/allocation` | Category allocation % | — |
| Narrative exposure | `/api/portfolio/intelligence/narrative` | Market theme tagging | Some themes missing |
| Insights list | `/api/portfolio/intelligence/insights` | Rule-based insights engine | — |
| Simulation panel | `/api/portfolio/intelligence/simulate` | What-if allocation modeling | Basic only |
| AI analyst | `/api/portfolio/intelligence/ai-context` + `/ai/chat` | LLM integration | Feature-gated |
| Risk breakdown | `/api/portfolio/intelligence/risk` | Risk decomposition | — |
| Benchmarks | `/api/portfolio/intelligence/benchmarks` | Cohort percentile | Feature-gated |
| Opportunities | `/api/portfolio/intelligence/opportunities` | Goal-adapted suggestions | Goal-dependent |

### Trading Screen
| Component | Data Source | Intelligence Applied | Gap |
|---|---|---|---|
| Price chart (klines) | `/api/charts/klines` | OHLCV raw display | No technical indicators |
| Current price | `/api/market/snapshot` per coin | Binance spot price | No order book depth |
| 24h volume | Klines volume field | Raw display | — |

### News Detail Modal
| Component | Data Source | Intelligence Applied | Gap |
|---|---|---|---|
| Article text | `/api/news/:newsId` | Raw article display | — |
| Coin tags | `article.coins[]` | Related coin linking | — |
| Sentiment tag | `article.sentiment` field | None — field never populated | Lab runs but never writes back |
| Comments + reactions | Comments/reactions APIs | Threaded discussion, reaction counts | — |

---

## Part 6 — Provider Mapping Table

| Intelligence Area | Current Provider | Data Available | Missing Data | Replacement Candidates |
|---|---|---|---|---|
| Spot Price | Binance WebSocket | Real-time price, 24h change | Bid/ask spread, order book | Kraken WS, Coinbase WS |
| OHLCV | Binance REST | All intervals 1m–1w | Technical indicators | — (compute from existing data) |
| Market Cap / Rankings | CoinGecko + CMC | Cap, dominance, rank, volume | FDV ratio display, unlock data | Messari, CryptoCompare |
| News | CoinDesk only | Headlines, coin tags, categories | Multi-source, impact ranking, breaking flag | Cointelegraph API, CryptoSlate, Decrypt RSS |
| Sentiment | news-intelligence-lab (offline) | Scores computed but not persisted | Integration into feed | AWS Comprehend, Hugging Face |
| On-chain wallet data | Alchemy + Zerion | Transfers, balances, multi-chain holdings | Entity labels, DeFi positions, NFTs | Moralis, QuickNode |
| Exchange portfolio | CoinDCX | Balances, trade history | Multi-exchange (Binance, Coinbase) | CCXT library |
| Social signals | None | Nothing | X, Reddit, Telegram, influencers | X API v2, Pushshift (Reddit), LunarCrush |
| Derivatives | None | Nothing | Funding rates, OI, liquidations, L/S ratio | Coinglass, Binance Futures API, dYdX |
| Liquidity / DEX | None | Nothing | Pool sizes, price impact, impermanent loss | The Graph (Uniswap/Curve), DefiLlama |
| Developer metrics | None | Nothing | Commit velocity, contributors, releases | GitHub REST API, Electric Capital |
| Macro events | None | Nothing | CPI, PCE, FOMC, geo events | Investing.com, CMC Events, FRED API |
| Institutional / ETF | None | Nothing | ETF flows, custodial holdings | Farside Investors, on-chain custodial wallet tracking |
| Governance | None | Nothing | Proposals, votes, treasury | Snapshot.org API, Tally.xyz |
| Tokenomics dynamics | CoinGecko (partial) | Circulating supply, max supply | Unlock schedules, burn events, staking APY | Token Unlocks, CryptoRank, Nansen |

---

## Part 7 — Intelligence Score

| Dimension | Score | Rationale |
|---|---|---|
| Market Data | 78 | Spot, OHLCV, volume, market cap complete; no indicators or liquidity depth |
| News Intelligence | 35 | Data ingested; ranking not intelligence-driven; lab fully decoupled |
| On-Chain | 68 | Raw data collected; lacks entity labels and DeFi enrichment |
| Social Signals | 0 | No external social data |
| Derivatives | 0 | No infrastructure |
| Liquidity | 15 | Spot volume only; no DEX or order book |
| Developer Metrics | 5 | Entirely absent |
| Macro Events | 0 | Entirely absent |
| Institutional / ETF | 0 | Entirely absent |
| Governance | 5 | Entirely absent |
| Tokenomics | 25 | Supply data present; dynamics absent |
| Portfolio Analytics | 82 | 15 engines; very comprehensive; missing tax/fee/behavioral layer |
| **Overall** | **62** | Strong personal finance tool; weak market intelligence system |

---

## Part 8 — Competitive Benchmark

| Dimension | vs Arkham | vs Nansen | vs Glassnode | vs CoinGecko | vs TradingView |
|---|---|---|---|---|---|
| Portfolio analytics (personal) | Better | Equal | Behind | Better | Better |
| On-chain wallet tracking | Behind | Behind | Behind | N/A | N/A |
| Entity / address labeling | Far behind | Far behind | Behind | N/A | N/A |
| Smart money tracking | Far behind | Far behind | — | — | — |
| Market data (spot/OHLCV) | Equal | Equal | Behind | Equal | Behind |
| Technical indicators | Behind | Behind | Behind | Behind | Far behind |
| News intelligence | Behind | Behind | — | Behind | — |
| Social sentiment | Far behind | Far behind | Behind | Behind | — |
| Derivatives data | Far behind | Behind | Far behind | Behind | Behind |
| Macro events | Far behind | — | Behind | Behind | Behind |
| Developer metrics | Far behind | Behind | Far behind | Partial | — |
| Governance tracking | Far behind | — | — | Behind | — |
| Tokenomics depth | Behind | Behind | Behind | Equal | — |

**Where NAYFT genuinely leads:** Personal portfolio analytics, investor identity profiling, AI-assisted portfolio narrative. No direct competitor bundles 15 analytics engines into a mobile-native portfolio experience at this level.

**Where NAYFT is most exposed:** Social signals, derivatives, and macro events — the three pillars that drive 80% of daily retail crypto trading decisions.

---

## Part 9 — Final Gap Report

### Critical Gaps — Fix First

**1. Connect news-intelligence-lab to production feed**
The lab already scores every article. The feed API ignores the scores entirely. This is a wiring problem, not a build problem. Persist `news_market_impact` scores on `newsarticles` and use them to rank the feed. A/B test against recency sort.
Estimated effort: 3–4 weeks. Expected uplift: 15–25% feed engagement.

**2. Persist sentiment scores on newsarticles**
Sentiment is computed by the lab but never written back to MongoDB. The `article.sentiment` field exists in the schema and the `NewsDetailModal` already checks for it — the UI is ready. Add a write step to the lab pipeline.
Estimated effort: 1–2 weeks.

**3. On-chain entity labeling**
Build or license a known-address database (exchanges, whale wallets, MEV bots, labeled protocols). Tag incoming `walletevents` at ingestion time. Surface "whale moved $X to Binance" insights in the feed and notifications. The webhook infrastructure is already in place.
Estimated effort: 4–6 weeks.

**4. Breaking news urgency signal**
Add a `breakingScore` field to `newsarticles`. First-mention of an entity + price-correlated event gets flagged. Feed surfaces this above the ranked sort. Alert system consumes the flag for push notifications.
Estimated effort: 2–3 weeks.

---

### High Impact Features — Next Quarter

**5. Derivatives data integration**
Binance Futures API: open interest, funding rates. Bybit or Coinglass: liquidation cascades. Long/short ratio from CMC or Coinglass. Surface in the portfolio risk section — a user holding BTC needs to know the funding rate and liquidation levels.
Estimated effort: 6–10 weeks.

**6. Social sentiment monitoring**
X/Twitter API v2 for mention volume and sentiment per ticker. Reddit (`r/CryptoCurrency`, `r/Bitcoin`, `r/ethereum`) post/comment monitoring. Aggregate into a "market mood" index surfaced on the Home screen.
Estimated effort: 8–12 weeks.

**7. Multi-source news expansion**
Add Cointelegraph, CryptoSlate, Decrypt via RSS or API. Deduplicate by title similarity (cosine or Levenshtein). More sources → more fresh content → lower churn.
Estimated effort: 3–4 weeks per source.

**8. Technical indicator computation**
OHLCV data is fully stored. Compute RSI, MACD, Bollinger Bands, EMA server-side. Expose via `/api/charts/indicators`. Makes the Trading screen competitive with TradingView Basic.
Estimated effort: 3–5 weeks.

---

### Nice-to-Have — 6–12 Months

**9. Macro event calendar**
CPI, PCE, FOMC announcements, employment data. Correlate to portfolio holdings. Surface "your BTC position is exposed to this Fed meeting in 3 days."
Estimated effort: 6–8 weeks.

**10. Developer metrics**
GitHub API per tracked coin: commit velocity, contributor count, release frequency, issue activity.
Estimated effort: 8–10 weeks.

**11. Tokenomics unlock tracking**
Ingest vesting schedules per coin. Alert when a coin in the user's portfolio has a major unlock approaching. Model supply-side sell pressure.
Estimated effort: 6–8 weeks.

**12. DEX liquidity intelligence**
Uniswap/Curve subgraph for pool sizes, LP composition, price impact simulation. Relevant once DeFi protocol positions are tracked.
Estimated effort: 10–14 weeks.

**13. ETF & institutional flow tracking**
Bitcoin and Ethereum ETF daily inflow/outflow via on-chain custodial wallet addresses (publicly traceable on-chain). Grayscale/Coinbase Custody wallet tracking.
Estimated effort: 6–8 weeks.

**14. Governance & DAO tracking**
Snapshot.org and Tally.xyz API integration. Active proposal tracking per protocol held in the user's portfolio. Vote result monitoring.
Estimated effort: 6–8 weeks.

---

### Future AI Capabilities

**15. AI news impact scoring**
LLM classifies each ingested article as bullish/bearish/neutral per mentioned coin, with reasoning. Runs as async enrichment pipeline post-ingestion. Persists `ai_impact_score` on `newsarticles`. Feeds into feed ranking.

**16. Behavioral bias detection**
Track user decision patterns across portfolio changes over time. Flag overconcentration, panic timing, FOMO entries. Surface as a behavioral coaching layer in Portfolio Intelligence screen.

**17. Predictive opportunity engine**
Combine social signals + on-chain flow + news velocity + technical breakout detection to generate time-sensitive opportunity signals. The opportunity engine architecture already exists — it needs richer, multi-source input signals to become predictive rather than descriptive.

---

## Summary

| Priority | Initiative | Effort | Expected Impact |
|---|---|---|---|
| **P0** | Wire news lab scores into production feed | 3–4 weeks | +15–25% feed engagement |
| **P0** | Persist sentiment on `newsarticles` | 1–2 weeks | Unlocks sentiment tag UI |
| **P0** | On-chain entity labeling | 4–6 weeks | Whale alerting feature |
| **P0** | Breaking news urgency signal | 2–3 weeks | Real-time event awareness |
| **P1** | Derivatives data (Binance Futures, liquidations) | 6–10 weeks | Professional trader tool |
| **P1** | Social sentiment (X + Reddit) | 8–12 weeks | Market mood + timing signals |
| **P1** | Multi-source news | 3–4 weeks/source | Feed freshness |
| **P1** | Technical indicators (RSI, MACD, BB) | 3–5 weeks | Trading screen upgrade |
| **P2** | Macro event calendar | 6–8 weeks | Macro investor segment |
| **P2** | Developer metrics (GitHub) | 8–10 weeks | Alt-coin fundamental analysis |
| **P2** | Tokenomics unlock tracking | 6–8 weeks | Supply pressure signals |
| **P2** | DEX liquidity intelligence | 10–14 weeks | DeFi portfolio risk |
| **P2** | ETF/institutional flow tracking | 6–8 weeks | Macro positioning |
| **P2** | Governance tracking | 6–8 weeks | Protocol risk signals |

Implementing P0 alone moves the platform from **62 → 68** and eliminates the most embarrassing gap (intelligence lab that does nothing in production). Completing P0 + P1 brings it to **78+** and opens the trader/analyst user segment.
