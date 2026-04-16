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
  /** Default max server-side query time for heavy chart reads (OhlcvKline / MarketTrade). */
  mongoMaxQueryTimeMs: parseInt(process.env.MONGO_MAX_QUERY_TIME_MS || '10000', 10),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_key_change_later',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cmcApiKey: process.env.CMC_API_KEY || '7c5caaa1d15946799fdc96a8a12ad759',
  cmcBaseUrl: process.env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com',
  coindeskApiKey: process.env.COIN_DESK_API_KEY || '',
  coindeskBaseUrl: process.env.COIN_DESK_BASE_URL || 'https://data-api.coindesk.com',
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
  zerionBaseUrl:            process.env.ZERION_BASE_URL  || '',
  zerionApiKey:             process.env.ZERION_API_KEY   || '',
  eventAggregationWindowMs: parseInt(process.env.EVENT_AGGREGATION_WINDOW_MS || '120000', 10),
  walletEventCooldownMs:    parseInt(process.env.WALLET_EVENT_COOLDOWN_MS    || '300000', 10),
  walletPollIntervalMs:     parseInt(process.env.WALLET_POLL_INTERVAL_MS     || '60000',  10),
  supportedChains:          process.env.SUPPORTED_CHAINS || 'eth,polygon,bnb',
  holdingsCacheTtlMs:       parseInt(process.env.HOLDINGS_CACHE_TTL_MS       || '300000', 10),
  // Alchemy Notify – webhook management
  alchemyAuthToken:         process.env.ALCHEMY_AUTH_TOKEN      || '',
  alchemyNotifyBaseUrl:     process.env.ALCHEMY_NOTIFY_BASE_URL || 'https://dashboard.alchemy.com/api',
  alchemyWebhookIds:        process.env.ALCHEMY_WEBHOOK_IDS     || '{}',
  alchemyWebhookSigningKeys: process.env.ALCHEMY_WEBHOOK_SIGNING_KEYS || '{}',
  // Zerion tx-subscriptions
  zerionSubscriptionId:     process.env.ZERION_SUBSCRIPTION_ID  || '',
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
  coinDataReadFromNewCollections:
    (process.env.COIN_DATA_READ_FROM_NEW_COLLECTIONS || 'true').toLowerCase() === 'true',
  coinDataDualWriteEnabled:
    (process.env.COIN_DATA_DUAL_WRITE_ENABLED || 'true').toLowerCase() === 'true',
  coinDataRequireInternalCoinId:
    (process.env.COIN_DATA_REQUIRE_INTERNAL_COIN_ID || 'false').toLowerCase() === 'true',
  coinDataPrimarySnapshotProvider:
    (process.env.COIN_DATA_PRIMARY_SNAPSHOT_PROVIDER || 'coingecko').toLowerCase(),
};

