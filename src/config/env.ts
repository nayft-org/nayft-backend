import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27018/crypto_db',
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
};

