import { connectDatabase } from '../../../config/database';
import { config } from '../../../config/env';
import { Holding } from '../../portfolio/models/Holding';
import { recomputeEnqueueService } from '../services/recomputeEnqueue.service';
import { createCorrelationId } from '../utils/correlationId';
import { piConfig } from '../config/piConfig';

const STALE_MS = parseInt(process.env.PI_HOLDINGS_STALE_MS || String(6 * 60 * 60 * 1000), 10);

export async function runHoldingsReconciliation(sampleSize = 200): Promise<number> {
  await connectDatabase();

  const cutoff = new Date(Date.now() - STALE_MS);
  const stale = await Holding.find({
    totalValue: { $gt: 0 },
    syncedAt: { $lt: cutoff },
  })
    .select('userId syncedAt')
    .limit(sampleSize)
    .lean();

  let enqueued = 0;

  for (const row of stale) {
    if (!piConfig.enqueueEnabled && !piConfig.workerEnabled) break;
    const ok = await recomputeEnqueueService.enqueue(row.userId as string, 'holdings_reconcile', {
      correlationId: createCorrelationId('hrc'),
    });
    if (ok) enqueued += 1;
  }

  console.log('[PI HoldingsReconciliation]', {
    staleFound: stale.length,
    enqueued,
    staleThresholdMs: STALE_MS,
    exchangeEnabled: config.exchangePortfolioEnabled,
  });
  return enqueued;
}

if (require.main === module) {
  runHoldingsReconciliation()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
