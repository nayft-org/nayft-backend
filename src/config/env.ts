import dotenv from 'dotenv';

dotenv.config();

/** HTTP bind address: set `HOST` in `.env` (e.g. LAN IP) to reach from devices; omit for `localhost` only. */
const hostFromEnv = process.env.HOST?.trim();
export const config = {
  port: parseInt(process.env.PORT || '4001', 10),
  host: hostFromEnv && hostFromEnv.length > 0 ? hostFromEnv : 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27020/crypto_db',
  /** Per-operation socket read/write timeout (ms). Increase if chart/aggregation queries hit MongoNetworkTimeoutError. */
  mongoSocketTimeoutMs: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || '120000', 10),
  /** Wait for a server when connecting or after recovery (ms). */
  mongoServerSelectionTimeoutMs: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '30000', 10),
  /** Initial TCP connection handshake timeout (ms). */
  mongoConnectTimeoutMs: parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || '10000', 10),
  /** Default max server-side query time for heavy chart reads (`market_ohlcv_candles` / `exchange_trade_ticks`). */
  mongoMaxQueryTimeMs: parseInt(process.env.MONGO_MAX_QUERY_TIME_MS || '10000', 10),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_key_change_later',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cmcApiKey: process.env.CMC_API_KEY || '7c5caaa1d15946799fdc96a8a12ad759',
  cmcBaseUrl: process.env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com',
  coindeskApiKey: process.env.COIN_DESK_API_KEY || '',
  coindeskBaseUrl: process.env.COIN_DESK_BASE_URL || 'https://data-api.coindesk.com',
  /** `store-news` bulk ingest: `coindesk` (default) or local news-extraction-engine shim. */
  newsUpstream: (() => {
    const v = (process.env.NEWS_UPSTREAM || 'coindesk').toLowerCase();
    return v === 'extraction' ? ('extraction' as const) : ('coindesk' as const);
  })(),
  /** Base URL for news-extraction-engine (e.g. http://localhost:5002). Required when newsUpstream is extraction. */
  newsUpstreamUrl: (process.env.NEWS_UPSTREAM_URL || '').trim(),
  /** HTTP timeout (ms) for news-extraction-engine list requests. */
  newsUpstreamTimeoutMs: Math.max(1000, parseInt(process.env.NEWS_UPSTREAM_TIMEOUT_MS || '30000', 10)),
  coinGeckoApiKey: process.env.COIN_GECKO_API_KEY || '',
  coinGeckoApiType: (process.env.COIN_GECKO_API_TYPE || 'demo').toLowerCase() as 'demo' | 'pro',
  coinGeckoBaseUrl:
    process.env.COIN_GECKO_BASE_URL ||
    (process.env.COIN_GECKO_API_TYPE?.toLowerCase() === 'pro'
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3'),
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:8082,http://localhost:8083,http://localhost:5173')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  // Wallet monitoring – RPC
  alchemyBaseUrl:           process.env.ALCHEMY_BASE_URL || '',
  alchemyApiKey:            process.env.ALCHEMY_API_KEY  || '',
  alchemyRpcBudgetEnabled:
    (process.env.ALCHEMY_RPC_BUDGET_ENABLED || 'true').toLowerCase() !== 'false',
  alchemyRpcDailyBudget:    Math.max(0, parseInt(process.env.ALCHEMY_RPC_DAILY_BUDGET || '100', 10)),
  zerionBaseUrl:            process.env.ZERION_BASE_URL  || '',
  zerionApiKey:             process.env.ZERION_API_KEY   || '',
  eventAggregationWindowMs: parseInt(process.env.EVENT_AGGREGATION_WINDOW_MS || '120000', 10),
  walletEventCooldownMs:    parseInt(process.env.WALLET_EVENT_COOLDOWN_MS    || '300000', 10),
  walletPollIntervalMs:     parseInt(process.env.WALLET_POLL_INTERVAL_MS     || '60000',  10),
  supportedChains:          process.env.SUPPORTED_CHAINS || 'eth,polygon,arb,sol,bnb',
  holdingsCacheTtlMs:       parseInt(process.env.HOLDINGS_CACHE_TTL_MS       || '300000', 10),
  /**
   * When true, portfolio holdings prefer the persisted read model whenever a cached row exists.
   * `refresh=1` still forces the current live/provider-backed path. Default false for safe rollout.
   */
  holdingsReadModelPrimaryEnabled:
    (process.env.HOLDINGS_READ_MODEL_PRIMARY_ENABLED || 'false').toLowerCase() === 'true',
  // Alchemy Notify – webhook management
  alchemyAuthToken:         process.env.ALCHEMY_AUTH_TOKEN      || '',
  alchemyNotifyBaseUrl:     process.env.ALCHEMY_NOTIFY_BASE_URL || 'https://dashboard.alchemy.com/api',
  alchemyWebhookIds:        process.env.ALCHEMY_WEBHOOK_IDS     || '{}',
  alchemyWebhookSigningKeys: process.env.ALCHEMY_WEBHOOK_SIGNING_KEYS || '{}',
  // Zerion tx-subscriptions
  zerionSubscriptionId:     process.env.ZERION_SUBSCRIPTION_ID  || '',
  /**
   * When false, addWallet/removeWallet skip Alchemy Notify and Zerion subscription HTTP calls.
   * Default true (unchanged behavior). Portfolio module only.
   */
  allowProviderSubscriptionWrites:
    (process.env.ALLOW_PROVIDER_SUBSCRIPTION_WRITES || 'true').toLowerCase() !== 'false',
  // Public webhook URL (Cloudflare tunnel)
  webhookBaseUrl:           process.env.WEBHOOK_BASE_URL         || '',
  /** 0–1: fraction of requests to log in production (Phase 0 observability). Default 1 in dev, 0.05 in prod. */
  perfLogSampleRate: (() => {
    const raw = process.env.PERF_LOG_SAMPLE_RATE;
    if (raw !== undefined && raw !== '') return Math.min(1, Math.max(0, parseFloat(raw)));
    return (process.env.NODE_ENV || 'development') === 'production' ? 0.05 : 1;
  })(),
  /** Use batched DB path for GET /api/charts/market-trend-v2 when true (same numeric output as v1). */
  marketTrendV2Enabled: (process.env.MARKET_TREND_V2_ENABLED || 'true').toLowerCase() === 'true',
  /**
   * When true, GET /api/charts/market-trend defaults to the guarded v2 path.
   * Default false so the existing endpoint keeps current behavior unless explicitly enabled.
   */
  marketTrendDefaultToV2Enabled:
    (process.env.MARKET_TREND_DEFAULT_TO_V2_ENABLED || 'false').toLowerCase() === 'true',
  /** Web OAuth client ID used to verify Google Sign-In idTokens from the mobile app. */
  googleWebClientId: (process.env.GOOGLE_WEB_CLIENT_ID || '').trim(),
  /** Google Cloud Translation API v2 — enables backend news/search/comment translation when set. */
  googleTranslateApiKey: (process.env.GOOGLE_TRANSLATE_API_KEY || '').trim(),
  /**
   * `google` (default when API key set), `mymemory`, or `noop` to force English passthrough for testing.
   */
  translationProvider: (process.env.TRANSLATION_PROVIDER || '').trim().toLowerCase(),
  /**
   * When no Google key: allow MyMemory public API (dev-friendly). Disable in prod with
   * `TRANSLATION_DISABLE_MYMEMORY=true` or enable in prod with `TRANSLATION_FALLBACK_MYMEMORY=true`.
   */
  translationAllowMymemoryFallback: (() => {
    if (process.env.TRANSLATION_DISABLE_MYMEMORY === 'true') return false;
    if (process.env.TRANSLATION_FALLBACK_MYMEMORY === 'true') return true;
    return (process.env.NODE_ENV || 'development') !== 'production';
  })(),
  /** Coin profile `/coins/:id/news`: when Mongo has no articles, allow CoinDesk HTTP fallback (2s race). Default false. */
  enableCoindeskNewsFallback: (process.env.ENABLE_COINDESK_NEWS_FALLBACK || '').toLowerCase() === 'true',
  /**
   * When true, coin profile reads prefer local DB/snapshot data before external CoinGecko fetches.
   * Default false for guarded rollout because output drift must be validated first.
   */
  coinProfileLocalFirstEnabled:
    (process.env.COIN_PROFILE_LOCAL_FIRST_ENABLED || 'false').toLowerCase() === 'true',
  coinDataPrimarySnapshotProvider:
    (process.env.COIN_DATA_PRIMARY_SNAPSHOT_PROVIDER || 'coingecko').toLowerCase(),

  // ── CoinDCX / exchange portfolio ─────────────────────────────────────────
  exchangePortfolioEnabled: (process.env.EXCHANGE_PORTFOLIO_ENABLED || 'true').toLowerCase() === 'true',
  exchangeBackfillEnabled: (process.env.EXCHANGE_BACKFILL_ENABLED || 'true').toLowerCase() !== 'false',
  exchangeLiveSyncEnabled: (process.env.EXCHANGE_LIVE_SYNC_ENABLED || 'true').toLowerCase() !== 'false',
  exchangeReconcileEnabled: (process.env.EXCHANGE_RECONCILE_ENABLED || 'false').toLowerCase() === 'true',
  exchangeSchedulerColocated: (process.env.EXCHANGE_SCHEDULER_COLOCATED || 'true').toLowerCase() !== 'false',
  coindcxBaseUrl: process.env.COINDCX_BASE_URL || 'https://api.coindcx.com',
  coindcxHttpTimeoutMs: parseInt(process.env.COINDCX_HTTP_TIMEOUT_MS || '25000', 10),
  coindcxRpmPerKey: Math.max(1, parseInt(process.env.COINDCX_RPM_PER_KEY || '20', 10)),
  coindcxRpmGlobal: Math.max(1, parseInt(process.env.COINDCX_RPM_GLOBAL || '60', 10)),
  exchangeLivePollIntervalMs: parseInt(process.env.EXCHANGE_LIVE_POLL_INTERVAL_MS || '90000', 10),
  exchangeBackfillChunkTrades: Math.max(50, parseInt(process.env.EXCHANGE_BACKFILL_CHUNK_TRADES || '300', 10)),
  exchangeMaxConnectionsPerUser: Math.max(1, parseInt(process.env.EXCHANGE_MAX_CONNECTIONS_PER_USER || '5', 10)),
  exchangeLockTtlMs: parseInt(process.env.EXCHANGE_LOCK_TTL_MS || '120000', 10),
  /** AES-256-GCM key: 64 hex chars (32 bytes). Falls back to derived key from jwtSecret if unset (dev only). */
  exchangeSecretsKeyHex: (process.env.EXCHANGE_SECRETS_KEY_HEX || '').trim(),
  exchangeCircuitFailureThreshold: Math.max(1, parseInt(process.env.EXCHANGE_CIRCUIT_FAILURE_THRESHOLD || '5', 10)),
  exchangeCircuitOpenMs: parseInt(process.env.EXCHANGE_CIRCUIT_OPEN_MS || '120000', 10),
  /** How often the colocated exchange poll loop runs (ms). */
  exchangeSchedulerTickMs: Math.max(5_000, parseInt(process.env.EXCHANGE_SCHEDULER_TICK_MS || '20000', 10)),
  /** Max exchange connections to dequeue per tick (avoids long ticks). */
  exchangePollBatchSize: Math.max(1, parseInt(process.env.EXCHANGE_POLL_BATCH_SIZE || '8', 10)),
  /** API key for POST /api/news/store-news ingestion */
  newsIngestApiKey: (process.env.NEWS_INGEST_API_KEY || '').trim(),
};

const DEFAULT_JWT = 'super_secret_key_change_later';
if (config.nodeEnv === 'production' && config.jwtSecret === DEFAULT_JWT) {
  throw new Error('JWT_SECRET must be set in production');
}
if (config.nodeEnv === 'production' && !process.env.ADMIN_API_KEY?.trim()) {
  console.warn('[Config] ADMIN_API_KEY is not set — admin routes will return 501');
}
if (config.nodeEnv === 'production' && config.frontendUrls.length === 1 && config.frontendUrls[0] === '*') {
  console.warn('[Config] FRONTEND_URL=* in production — restrict CORS origins for compliance');
}
