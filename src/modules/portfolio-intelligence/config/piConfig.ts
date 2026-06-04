function parseBool(envKey: string, defaultValue: boolean): boolean {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return defaultValue;
  return raw.toLowerCase() === 'true' || raw === '1';
}

function parseIntEnv(envKey: string, defaultValue: number): number {
  const n = parseInt(process.env[envKey] || String(defaultValue), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export const piConfig = {
  enabled: parseBool('PI_ENABLED', false),
  shadowMode: parseBool('PI_SHADOW_MODE', true),
  workerEnabled: parseBool('PI_WORKER_ENABLED', false),
  enqueueEnabled: parseBool('PI_ENQUEUE_ENABLED', false),
  fanoutEnabled: parseBool('PI_FANOUT_ENABLED', false),
  normalizedReadEnabled: parseBool('PI_NORMALIZED_READ_ENABLED', false),
  /** Remove 2s Zerion sleep from API holdings path (G7). */
  apiZerionSleepDisabled: parseBool('PI_API_ZERION_SLEEP_DISABLED', false),
  /** Disable opportunistic aggregator holdings upsert (G7). */
  aggregatorUpsertDisabled: parseBool('PI_AGGREGATOR_UPSERT_DISABLED', false),
  redisPrefix: (process.env.PI_REDIS_PREFIX || 'pi:').trim(),
  streamKey: 'pi:recompute:stream',
  dlqStreamKey: 'pi:recompute:dlq',
  highPriorityStreamKey: 'pi:recompute:high',
  consumerGroup: 'pi-recompute-processors',
  streamMaxLen: 100_000,
  dlqMaxLen: 10_000,
  debounceMs: parseIntEnv('PI_DEBOUNCE_MS', 60_000),
  pendingTtlSec: 120,
  lockTtlMs: parseIntEnv('PI_LOCK_TTL_MS', 120_000),
  backpressureDepth: parseIntEnv('PI_BACKPRESSURE_DEPTH', 10_000),
  backpressureResumeDepth: parseIntEnv('PI_BACKPRESSURE_RESUME_DEPTH', 5_000),
  maxRetries: parseIntEnv('PI_MAX_RETRIES', 3),
  positionsCacheTtlSec: parseIntEnv('PI_POSITIONS_CACHE_TTL_SEC', 1800),
  analyticsCacheTtlSec: parseIntEnv('PI_ANALYTICS_CACHE_TTL_SEC', 3600),
  feedContextCacheTtlSec: parseIntEnv('PI_FEED_CONTEXT_CACHE_TTL_SEC', 30),
  categoryCatalogTtlSec: parseIntEnv('PI_CATEGORY_CATALOG_TTL_SEC', 86400),
  coinCategoriesTtlSec: parseIntEnv('PI_COIN_CATEGORIES_TTL_SEC', 86400),
  buildLockTtlSec: parseIntEnv('PI_BUILD_LOCK_TTL_SEC', 300),
  snapshotValueDriftThreshold: parseFloat(process.env.PI_SNAPSHOT_VALUE_DRIFT_THRESHOLD || '0.005'),
  shadowValueDriftAlertPct: parseFloat(process.env.PI_SHADOW_DRIFT_ALERT_PCT || '0.02'),
  dailySnapshotBatchPerMin: parseIntEnv('PI_DAILY_SNAPSHOT_BATCH_PER_MIN', 500),
  schemaVersion: 2,
  jobSchemaVersion: 1,
  contextSchemaVersion: 1,
  fanoutChannel: 'pi:fanout',
  xautoclaimIdleMs: 120_000,
  xautoclaimBatch: 10,
};

export function resolvePiPrefix(shadow = false): string {
  const base = piConfig.redisPrefix.endsWith(':') ? piConfig.redisPrefix : `${piConfig.redisPrefix}:`;
  return shadow ? `${base}shadow:` : base;
}
