export const RISK_REDIS_PREFIX = process.env.RRS_REDIS_PREFIX || 'risk:';

export const riskRedisKeys = {
  buildLock: `${RISK_REDIS_PREFIX}build:lock`,
  revision: `${RISK_REDIS_PREFIX}revision`,
  snapshot: `${RISK_REDIS_PREFIX}snapshot:v1`,
  snapshotStaging: `${RISK_REDIS_PREFIX}snapshot:staging:v1`,
  manifest: `${RISK_REDIS_PREFIX}snapshot:manifest:v1`,
  manifestStaging: `${RISK_REDIS_PREFIX}snapshot:manifest:staging:v1`,
  coinPrefix: `${RISK_REDIS_PREFIX}coin:v1:`,
  topMovers: `${RISK_REDIS_PREFIX}top-movers:v1`,
  regime: `${RISK_REDIS_PREFIX}regime:v1`,
  feedChannel: `${RISK_REDIS_PREFIX}feed`,
  replayLock: `${RISK_REDIS_PREFIX}replay:lock`,
  shardStaging: (shardId: number) => `${RISK_REDIS_PREFIX}snapshot:shard:staging:v1:${shardId}`,
  shardActive: (shardId: number) => `${RISK_REDIS_PREFIX}snapshot:shard:v1:${shardId}`,
  shadowPrefix: `${RISK_REDIS_PREFIX}shadow:`,
  replayPrefix: (replayId: string) => `${RISK_REDIS_PREFIX}replay:${replayId}:`,
};

export function coinRiskKey(symbol: string, namespacePrefix = RISK_REDIS_PREFIX): string {
  return `${namespacePrefix}coin:v1:${symbol.toUpperCase()}`;
}
