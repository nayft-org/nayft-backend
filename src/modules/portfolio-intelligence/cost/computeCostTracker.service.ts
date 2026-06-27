import { piMetrics } from '../../../observability/piMetrics';

const ENGINE_COST_UNITS: Record<string, number> = {
  allocation: 1,
  risk: 0.5,
  narrative: 0.5,
  concentration: 0.3,
  diversification: 0.3,
  stablecoin: 0.2,
  health: 0.4,
  identity: 0.5,
  insights: 0.6,
  confidence: 0.2,
  benchmark: 0.3,
  opportunity: 0.4,
  explainability: 0.3,
  narrativeIntel: 0.3,
};

export const computeCostTracker = {
  record(_jobId: string, engineTimings: Record<string, number>): number {
    let totalUnits = 0;
    for (const [engineId, ms] of Object.entries(engineTimings)) {
      const base = ENGINE_COST_UNITS[engineId] ?? 0.1;
      const units = base + ms / 1000;
      totalUnits += units;
      piMetrics.engineLatencyMs(engineId, ms);
    }
    return totalUnits;
  },

  estimatePipelineCost(engineCount: number): number {
    return engineCount * 0.5;
  },
};
