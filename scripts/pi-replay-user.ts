/**
 * Offline replay certification for a user's analytics snapshot.
 * Usage: npx ts-node --transpile-only scripts/pi-replay-user.ts <userId> [revision]
 */
import { connectDatabase } from '../src/config/database';
import { PortfolioAnalyticsSnapshot } from '../src/modules/portfolio-intelligence/models/PortfolioAnalyticsSnapshot';
import { PortfolioSnapshot } from '../src/modules/portfolio-intelligence/models/PortfolioSnapshot';
import {
  buildEngineContext,
  runAnalyticsPipeline,
} from '../src/modules/portfolio-intelligence/engines/composition/piAnalyticsPipeline';
import { validateReplay } from '../src/modules/portfolio-intelligence/engines/math/canonicalJson';
import type { PortfolioAnalyticsPayloadV2 } from '../src/modules/portfolio-intelligence/contracts/piEngineContracts';
import type { NormalizedPosition } from '../src/modules/portfolio-intelligence/contracts/piContracts';

async function main(): Promise<void> {
  const userId = process.argv[2];
  const revisionArg = process.argv[3];
  if (!userId) {
    console.error('Usage: pi-replay-user.ts <userId> [revision]');
    process.exit(1);
  }

  await connectDatabase();

  const query = revisionArg
    ? { userId, revision: parseInt(revisionArg, 10) }
    : { userId, schemaVersion: 2 };

  const doc = await PortfolioAnalyticsSnapshot.findOne(query).sort({ revision: -1 }).lean();
  if (!doc?.payload) {
    console.error('No analytics snapshot found');
    process.exit(1);
  }

  const stored = doc.payload as PortfolioAnalyticsPayloadV2;
  const pin = stored.replayPin;

  const snap = await PortfolioSnapshot.findOne({
    userId,
    ingestRevision: pin.ingestRevision,
  })
    .sort({ asOf: -1 })
    .lean();

  const positions: NormalizedPosition[] = (snap?.positions ?? []).map((p) => ({
    positionKey: p.positionKey,
    internalCoinId: p.internalCoinId ?? null,
    coingeckoId: null,
    symbol: p.symbol,
    name: p.symbol,
    chain: 'unknown',
    quantity: 0,
    valueUsd: p.valueUsd,
    weightPct: p.weightPct,
    source: 'wallet' as const,
    mappingConfidence: 1,
  }));

  const totalValueUsd = snap?.totalValueUsd ?? positions.reduce((s, p) => s + p.valueUsd, 0);

  const ctx = await buildEngineContext({
    userId,
    correlationId: `replay-${doc.revision}`,
    ingestRevision: pin.ingestRevision,
    catalogVersion: pin.catalogVersion,
    positions,
    totalValueUsd,
  });
  ctx.replayMode = true;
  ctx.formulaBundle = pin.formulaBundle;
  ctx.taxonomyVersion = pin.taxonomyVersion;

  const recomputed = runAnalyticsPipeline(ctx);
  recomputed.computedAt = stored.computedAt;
  recomputed.correlationId = stored.correlationId;

  const result = validateReplay(stored, recomputed);
  console.log(JSON.stringify({ equal: result.equal, diffs: result.diffs, revision: doc.revision }, null, 2));
  process.exit(result.equal ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
