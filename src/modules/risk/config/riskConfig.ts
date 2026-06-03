function parseBool(envKey: string, defaultValue: boolean): boolean {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return defaultValue;
  return raw.toLowerCase() === 'true' || raw === '1';
}

export const RRS_VERSIONS = {
  factorSchemaVersion: '1.0.0',
  normalizationVersion: '1.0.0',
  crsFormulaVersion: '1.0.0',
  regimeLogicVersion: '1.0.0',
  providerVersions: {
    volatility: '1.0.0',
    liquidity: '1.0.0',
    drawdown: '1.0.0',
    fundamentals: '1.0.0',
    news: '1.0.0',
  },
} as const;

export const riskConfig = {
  enabled: parseBool('RRS_ENABLED', false),
  buildEnabled: parseBool('RRS_BUILD_ENABLED', false),
  apiEnabled: parseBool('RRS_API_ENABLED', false),
  shadowMode: parseBool('RRS_SHADOW_MODE', true),
  sentimentRrsEnabled: parseBool('SENTIMENT_RRS_ENABLED', false),
  buildCron: process.env.RRS_BUILD_CRON || '2,17,32,47 * * * *',
  buildLockTtlSec: parseInt(process.env.RRS_BUILD_LOCK_TTL_SEC || '600', 10),
  universeMaxSize: parseInt(process.env.RRS_UNIVERSE_MAX_SIZE || '2000', 10),
  universeMinMarketCap: parseFloat(process.env.RRS_UNIVERSE_MIN_MARKET_CAP || '1000000'),
  shardThreshold: parseInt(process.env.RRS_SHARD_THRESHOLD || '3000', 10),
  shardCount: parseInt(process.env.RRS_SHARD_COUNT || '16', 10),
  factorShardThreshold: parseInt(process.env.RRS_FACTOR_SHARD_THRESHOLD || '2000', 10),
  marketCapFloor: parseFloat(process.env.RRS_MARKET_CAP_FLOOR || '1000000'),
  newsConfidenceThreshold: parseFloat(process.env.RRS_NEWS_CONFIDENCE_THRESHOLD || '0.3'),
  newsMinArticleCount: parseInt(process.env.RRS_NEWS_MIN_ARTICLE_COUNT || '2', 10),
  newsStaleMs: parseInt(process.env.RRS_NEWS_STALE_MS || String(72 * 3_600_000), 10),
  ohlcStaleMs: parseInt(process.env.RRS_OHLC_STALE_MS || String(2 * 3_600_000), 10),
  marketStaleMs: parseInt(process.env.RRS_MARKET_STALE_MS || String(24 * 3_600_000), 10),
  confidenceInvalidThreshold: parseFloat(process.env.RRS_CONFIDENCE_INVALID_THRESHOLD || '0.05'),
  confidenceLowThreshold: parseFloat(process.env.RRS_CONFIDENCE_LOW_THRESHOLD || '0.3'),
  regimePersistenceBuilds: parseInt(process.env.RRS_REGIME_PERSISTENCE_BUILDS || '2', 10),
  regimePanicCooldownBuilds: parseInt(process.env.RRS_REGIME_PANIC_COOLDOWN_BUILDS || '3', 10),
  coinCacheTtlSec: parseInt(process.env.RRS_COIN_CACHE_TTL_SEC || '1200', 10),
  crsWeights: {
    volatility: parseFloat(process.env.RRS_WEIGHT_VOLATILITY || '0.25'),
    liquidity: parseFloat(process.env.RRS_WEIGHT_LIQUIDITY || '0.2'),
    drawdown: parseFloat(process.env.RRS_WEIGHT_DRAWDOWN || '0.2'),
    fundamentals: parseFloat(process.env.RRS_WEIGHT_FUNDAMENTALS || '0.15'),
    news: parseFloat(process.env.RRS_WEIGHT_NEWS || '0.2'),
  },
  ...RRS_VERSIONS,
};

export type BuildNamespace = 'production' | 'shadow' | 'replay';

export function resolveRedisPrefix(namespace: BuildNamespace, replayId?: string): string {
  if (namespace === 'shadow') return riskConfig.shadowMode ? 'risk:shadow:' : 'risk:';
  if (namespace === 'replay' && replayId) return `risk:replay:${replayId}:`;
  return 'risk:';
}
