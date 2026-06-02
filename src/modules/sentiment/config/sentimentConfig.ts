function parseBool(envKey: string, defaultValue: boolean): boolean {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return defaultValue;
  return raw.toLowerCase() === 'true' || raw === '1';
}

export const sentimentConfig = {
  enrichmentEnabled: parseBool('SENTIMENT_ENRICHMENT_ENABLED', false),
  workerEnabled: parseBool('SENTIMENT_WORKER_ENABLED', false),
  apiEnabled: parseBool('SENTIMENT_API_ENABLED', false),
  streamKey: 'sentiment:jobs',
  dlqStreamKey: 'sentiment:jobs:dlq',
  consumerGroup: 'sentiment-processors',
  streamMaxLen: 50_000,
  dlqMaxLen: 5_000,
  maxEnqueuePerCall: 500,
  maxAggregationArticles: 5_000,
  maxRetries: 3,
  backpressureDepth: 10_000,
  backpressureResumeDepth: 5_000,
  staleProcessingMs: 5 * 60 * 1000,
  xautoclaimIdleMs: 120_000,
  xautoclaimBatch: 10,
  coinCacheTtlSec: 900,
  snapshotCacheTtlSec: 900,
  buildLockTtlSec: 300,
  snapshotRetentionDays: 30,
  coinCachePrefix: 'sentiment:coin:v1:',
  snapshotKey: 'sentiment:snapshot:v1',
  buildLockKey: 'sentiment:build:lock',
  revisionKey: 'sentiment:revision',
  decayLambda: parseFloat(process.env.SENTIMENT_DECAY_LAMBDA || '0.05'),
  aggregationWindowHours: parseInt(process.env.SENTIMENT_AGGREGATION_WINDOW_HOURS || '72', 10),
  modelId: 'vader-crypto-v1',
  modelVersion: '1.0.0',
  aggregationCron: process.env.SENTIMENT_AGGREGATION_CRON || '*/15 * * * *',
  maxPayloadBytes: 2048,
};
