import { connectDatabase } from '../../../config/database';
import { Holding } from '../../portfolio/models/Holding';
import { piRepository } from '../repository/piRepository';
import { shadowDriftService } from '../services/shadowDrift.service';
import { eventService } from '../../../core/event-system';

export async function runPiReconciliation(sampleSize = 100): Promise<void> {
  await connectDatabase();
  const holdings = await Holding.find({ totalValue: { $gt: 0 } })
    .select('userId')
    .limit(sampleSize)
    .lean();

  for (const row of holdings) {
    const userId = row.userId as string;
    const report = await shadowDriftService.compareUser(userId);
    if (report.valueDrift > 0.01 || report.positionCountDrift > 2) {
      await eventService.emitEvent({
        featureKey: 'portfolio_intelligence_foundation',
        eventType: 'portfolio_intelligence.reconciliation_drift',
        userId,
        metadata: {
          valueDrift: report.valueDrift,
          positionCountDrift: report.positionCountDrift,
          userId,
        },
      });
    }
    await piRepository.findPositionsByUser(userId);
  }
}

if (require.main === module) {
  runPiReconciliation()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
