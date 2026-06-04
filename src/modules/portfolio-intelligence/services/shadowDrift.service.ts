import { piConfig } from '../config/piConfig';
import { piMetrics } from '../../../observability/piMetrics';
import { portfolioReadAdapter } from '../ports/portfolioReadAdapter';
import { piRepository } from '../repository/piRepository';

export type ShadowDriftReport = {
  userId: string;
  valueDrift: number;
  positionCountDrift: number;
  mappingCoverage: number;
};

export const shadowDriftService = {
  async compareUser(userId: string): Promise<ShadowDriftReport> {
    const legacy = await portfolioReadAdapter.findHoldingsByUser(userId);
    const normalized = await piRepository.findPositionsByUser(userId);

    const legacyTotal = legacy?.totalValue ?? 0;
    const normTotal = normalized.reduce((s, p) => s + p.valueUsd, 0);
    const valueDrift =
      legacyTotal > 0 ? Math.abs(normTotal - legacyTotal) / legacyTotal : normTotal > 0 ? 1 : 0;

    const legacyCount = legacy?.positions?.length ?? 0;
    const positionCountDrift = Math.abs(normalized.length - legacyCount);

    const mappingCoverage =
      normalized.length > 0
        ? normalized.filter((p) => p.mappingConfidence >= 0.5).length / normalized.length
        : 1;

    piMetrics.shadowDriftPct(valueDrift * 100);

    if (valueDrift > piConfig.shadowValueDriftAlertPct) {
      console.warn('[PI Shadow] value drift alert', { userId, valueDrift, legacyTotal, normTotal });
    }

    return { userId, valueDrift, positionCountDrift, mappingCoverage };
  },
};
