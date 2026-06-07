import { redis } from '../../../config/redis';

export const RISK_FACTOR_STREAM = 'risk:factor:jobs';
export const RISK_FACTOR_GROUP = 'risk-factor-workers';
export const RISK_FACTOR_DLQ = 'risk:factor:dlq';

export type RiskFactorJobPayload = {
  buildId: string;
  shardId: number;
  symbols: string[];
  buildCutoffTime: string;
};

function resultsKey(buildId: string): string {
  return `risk:factor:results:${buildId}`;
}

export async function ensureRiskFactorConsumerGroup(): Promise<void> {
  try {
    await redis.xgroup('CREATE', RISK_FACTOR_STREAM, RISK_FACTOR_GROUP, '0', 'MKSTREAM');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('BUSYGROUP')) throw err;
  }
}

export async function enqueueFactorShardJobs(
  buildId: string,
  shards: Array<{ shardId: number; symbols: string[] }>,
  buildCutoffTime: Date
): Promise<void> {
  for (const shard of shards) {
    const payload: RiskFactorJobPayload = {
      buildId,
      shardId: shard.shardId,
      symbols: shard.symbols,
      buildCutoffTime: buildCutoffTime.toISOString(),
    };
    await redis.xadd(RISK_FACTOR_STREAM, 'MAXLEN', '~', '10000', '*', 'payload', JSON.stringify(payload));
  }
}

export async function storeFactorShardResult(
  buildId: string,
  shardId: number,
  rawsJson: string
): Promise<void> {
  await redis.hset(resultsKey(buildId), String(shardId), rawsJson);
}

export async function getFactorShardResult(
  buildId: string,
  shardId: number
): Promise<string | null> {
  const v = await redis.hget(resultsKey(buildId), String(shardId));
  return v;
}

export async function countFactorShardResults(buildId: string): Promise<number> {
  return redis.hlen(resultsKey(buildId));
}

export async function clearFactorShardResults(buildId: string): Promise<void> {
  await redis.del(resultsKey(buildId));
}

export async function waitForFactorShards(
  buildId: string,
  expectedShards: number,
  timeoutMs = 600_000
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const n = await countFactorShardResults(buildId);
    if (n >= expectedShards) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
