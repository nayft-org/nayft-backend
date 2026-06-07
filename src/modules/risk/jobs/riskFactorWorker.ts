import { redis, redisBlocking } from '../../../config/redis';
import { connectDatabase } from '../../../config/database';
import { loadFrozenUniverse } from '../universe/rrsUniverse.service';
import {
  buildFactorContext,
  computeAllFactorRaws,
} from '../factors/factorEngine.service';
import {
  ensureRiskFactorConsumerGroup,
  RISK_FACTOR_DLQ,
  RISK_FACTOR_GROUP,
  RISK_FACTOR_STREAM,
  storeFactorShardResult,
  type RiskFactorJobPayload,
} from './riskFactorQueue.service';
import type { RiskFactorName, FactorRawResult } from '../types/factorTypes';
import { randomBytes } from 'crypto';

const WORKER_NAME = `risk-factor-${process.pid}-${randomBytes(4).toString('hex')}`;

async function processShard(payload: RiskFactorJobPayload): Promise<void> {
  const universe = await loadFrozenUniverse(payload.buildId);
  if (!universe) return;

  const subset = new Set(payload.symbols.map((s) => s.toUpperCase()));
  const filtered = {
    ...universe,
    members: universe.members.filter((m) => subset.has(m.symbol)),
  };
  if (filtered.members.length === 0) return;

  const ctx = await buildFactorContext(filtered);
  const raws = await computeAllFactorRaws(ctx);
  const serializable: Record<string, Record<RiskFactorName, FactorRawResult>> = {};
  for (const [sym, factors] of raws) {
    serializable[sym] = factors;
  }
  await storeFactorShardResult(
    payload.buildId,
    payload.shardId,
    JSON.stringify(serializable)
  );
}

async function pushDlq(id: string, reason: string, payloadRaw?: string): Promise<void> {
  const fields: string[] = ['reason', reason, 'original_id', id];
  if (payloadRaw) {
    fields.push('payload', payloadRaw.slice(0, 8000));
  }
  await redis.xadd(RISK_FACTOR_DLQ, '*', ...fields);
}

export async function runRiskFactorWorker(): Promise<void> {
  await connectDatabase();
  await ensureRiskFactorConsumerGroup();
  console.log('[RiskFactorWorker] started', WORKER_NAME);

  for (;;) {
    const batches = (await redisBlocking.xreadgroup(
      'GROUP',
      RISK_FACTOR_GROUP,
      WORKER_NAME,
      'COUNT',
      '1',
      'BLOCK',
      '5000',
      'STREAMS',
      RISK_FACTOR_STREAM,
      '>'
    )) as Array<[string, Array<[string, string[]]>]> | null;
    if (!batches?.length) continue;

    for (const [, messages] of batches) {
      for (const [id, fields] of messages) {
        const payloadRaw = fields[fields.indexOf('payload') + 1] ?? fields[1];
        if (!payloadRaw) {
          await pushDlq(id, 'missing_payload');
          await redis.xack(RISK_FACTOR_STREAM, RISK_FACTOR_GROUP, id);
          continue;
        }
        try {
          const payload = JSON.parse(payloadRaw) as RiskFactorJobPayload;
          if (!payload.buildId || !Array.isArray(payload.symbols)) {
            await pushDlq(id, 'invalid_schema', payloadRaw);
            await redis.xack(RISK_FACTOR_STREAM, RISK_FACTOR_GROUP, id);
            continue;
          }
          await processShard(payload);
          await redis.xack(RISK_FACTOR_STREAM, RISK_FACTOR_GROUP, id);
        } catch (err) {
          console.error('[RiskFactorWorker] job failed', err);
          await pushDlq(id, 'process_error', payloadRaw);
          await redis.xack(RISK_FACTOR_STREAM, RISK_FACTOR_GROUP, id);
        }
      }
    }
  }
}

if (require.main === module) {
  void runRiskFactorWorker().catch((err) => {
    console.error('[RiskFactorWorker] fatal', err);
    process.exit(1);
  });
}
