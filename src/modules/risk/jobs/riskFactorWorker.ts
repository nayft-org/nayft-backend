import { redis } from '../../../config/redis';
import { connectDatabase } from '../../../config/database';
import { loadFrozenUniverse } from '../universe/rrsUniverse.service';
import {
  buildFactorContext,
  computeAllFactorRaws,
} from '../factors/factorEngine.service';
import {
  ensureRiskFactorConsumerGroup,
  RISK_FACTOR_GROUP,
  RISK_FACTOR_STREAM,
  storeFactorShardResult,
  type RiskFactorJobPayload,
} from './riskFactorQueue.service';
import type { RiskFactorName, FactorRawResult } from '../types/factorTypes';

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

async function loop(): Promise<void> {
  await connectDatabase();
  await ensureRiskFactorConsumerGroup();

  for (;;) {
    const batches = (await redis.xreadgroup(
      'GROUP',
      RISK_FACTOR_GROUP,
      'worker-1',
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
        try {
          const payload = JSON.parse(payloadRaw) as RiskFactorJobPayload;
          await processShard(payload);
          await redis.xack(RISK_FACTOR_STREAM, RISK_FACTOR_GROUP, id);
        } catch (err) {
          console.error('[RiskFactorWorker] job failed', err);
        }
      }
    }
  }
}

void loop().catch((err) => {
  console.error('[RiskFactorWorker] fatal', err);
  process.exit(1);
});
