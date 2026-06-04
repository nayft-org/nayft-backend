import { piConfig, resolvePiPrefix } from '../config/piConfig';

export function buildPiRedisKeys(prefix = piConfig.redisPrefix) {
  const p = prefix.endsWith(':') ? prefix : `${prefix}:`;
  return {
    recomputeStream: piConfig.streamKey,
    recomputeDlq: piConfig.dlqStreamKey,
    recomputeHigh: piConfig.highPriorityStreamKey,
    debounce: (userId: string) => `${p}recompute:debounce:${userId}`,
    pending: (userId: string) => `${p}recompute:pending:${userId}`,
    lock: (userId: string) => `${p}recompute:lock:${userId}`,
    globalRevision: `${p}global:revision`,
    categoryCatalog: (version: number) => `${p}category:catalog:v${version}`,
    coinCategories: (internalCoinId: string, version: number) =>
      `${p}coin:{${internalCoinId}}:categories:v${version}`,
    userPositions: (userId: string) => `${p}user:{${userId}}:positions:v1`,
    userAnalytics: (userId: string) => `${p}user:{${userId}}:analytics:v1`,
    userAnalyticsStaging: (userId: string) => `${p}user:{${userId}}:analytics:staging:v1`,
    userManifest: (userId: string) => `${p}user:{${userId}}:manifest:v1`,
    userRevision: (userId: string) => `${p}user:{${userId}}:revision`,
    ingestRevision: (userId: string) => `${p}user:{${userId}}:ingest_revision`,
    wsSeq: (userId: string) => `${p}user:{${userId}}:ws_seq`,
    buildLock: `${p}build:lock`,
    fanoutChannel: piConfig.fanoutChannel,
    feedContext: (userId: string) => `feed:context:${userId}:v1`,
    zerionCircuit: (userId: string) => `${p}zerion:circuit:${userId}`,
    coingeckoCircuit: `${p}coingecko:circuit`,
    enqueuePaused: `${p}recompute:enqueue_paused`,
  };
}

export const piRedisKeys = buildPiRedisKeys();

export function shadowPiRedisKeys(): ReturnType<typeof buildPiRedisKeys> {
  return buildPiRedisKeys(resolvePiPrefix(true));
}
