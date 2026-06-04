import { piConfig } from '../config/piConfig';
import type { NormalizedPosition } from '../contracts/piContracts';
import { piRepository } from '../repository/piRepository';

export const snapshotWriterService = {
  async writeDeltaIfNeeded(
    userId: string,
    ingestRevision: number,
    analyticsRevision: number,
    positions: NormalizedPosition[],
    totalValueUsd: number,
    previousTotal?: number
  ): Promise<boolean> {
    const prev = previousTotal ?? 0;
    const drift =
      prev > 0 ? Math.abs(totalValueUsd - prev) / prev : totalValueUsd > 0 ? 1 : 0;
    if (drift < piConfig.snapshotValueDriftThreshold && prev > 0) {
      return false;
    }
    await piRepository.appendSnapshot({
      userId,
      ingestRevision,
      revision: analyticsRevision,
      positions,
      totalValueUsd,
      trigger: 'delta',
      ttlDays: 90,
    });
    return true;
  },

  async writeDaily(
    userId: string,
    ingestRevision: number,
    analyticsRevision: number,
    positions: NormalizedPosition[],
    totalValueUsd: number
  ): Promise<void> {
    await piRepository.appendSnapshot({
      userId,
      ingestRevision,
      revision: analyticsRevision,
      positions,
      totalValueUsd,
      trigger: 'daily',
      ttlDays: 365,
    });
  },
};
