import { randomUUID } from 'crypto';
import { cacheHelpers } from '../../../config/redis';
import { piRepository } from '../repository/piRepository';
import { runAnalyticsPipeline, buildEngineContext } from '../engines/composition/piAnalyticsPipeline';
import { createCorrelationId } from '../utils/correlationId';
import type { NormalizedPosition } from '../contracts/piContracts';
import { redis } from '../../../config/redis';

const SIM_TTL_SEC = 3600;

export type SimulationAdjustment = {
  action?: 'set_weight' | 'remove' | 'add' | 'shift_category';
  symbol?: string;
  category?: string;
  deltaPct?: number;
  weightDeltaPct?: number;
};

function simKey(id: string): string {
  return `pi:sim:${id}`;
}

function applyAdjustments(
  positions: NormalizedPosition[],
  totalValueUsd: number,
  adjustments: SimulationAdjustment[]
): { positions: NormalizedPosition[]; totalValueUsd: number } {
  const adjusted = positions.map((p) => ({ ...p }));
  let total = totalValueUsd;

  for (const adj of adjustments) {
    const deltaPct = adj.deltaPct ?? adj.weightDeltaPct ?? 0;
    if (adj.symbol) {
      const pos = adjusted.find((p) => p.symbol.toUpperCase() === adj.symbol!.toUpperCase());
      if (pos) {
        const deltaUsd = (total * deltaPct) / 100;
        pos.valueUsd = Math.max(0, pos.valueUsd + deltaUsd);
      }
    }
  }

  total = adjusted.reduce((s, p) => s + p.valueUsd, 0);
  for (const p of adjusted) {
    p.weightPct = total > 0 ? (p.valueUsd / total) * 100 : 0;
  }
  return { positions: adjusted, totalValueUsd: total };
}

export const portfolioSimulationService = {
  async simulateAllocationWhatIf(params: {
    userId: string;
    adjustments: SimulationAdjustment[];
    label?: string;
  }) {
    const positions = await piRepository.findPositionsByUser(params.userId);
    const totalValueUsd = positions.reduce((s, p) => s + p.valueUsd, 0);
    const { positions: adjusted, totalValueUsd: newTotal } = applyAdjustments(
      positions as NormalizedPosition[],
      totalValueUsd,
      params.adjustments
    );

    const catalogVersion = parseInt((await redis.get('pi:category:activeVersion')) || '1', 10) || 1;
    const ctx = await buildEngineContext({
      userId: params.userId,
      correlationId: createCorrelationId('sim'),
      ingestRevision: 0,
      catalogVersion,
      positions: adjusted,
      totalValueUsd: newTotal,
    });

    const result = runAnalyticsPipeline(ctx);
    const simulationId = randomUUID().slice(0, 16);
    const payload = {
      simulationId,
      scenario: params.label ?? 'what-if',
      simulated: true,
      totalValueUsd: newTotal,
      allocation: result.allocation,
      risk: result.risk,
      health: result.health,
      narrative: result.narrative,
      opportunities: result.opportunities,
      disclaimer: 'Simulation result — not live portfolio data. Not financial advice.',
      expiresAt: new Date(Date.now() + SIM_TTL_SEC * 1000).toISOString(),
    };

    await cacheHelpers.set(simKey(simulationId), payload, SIM_TTL_SEC);
    return payload;
  },

  async getSimulation(simulationId: string) {
    return cacheHelpers.get<Record<string, unknown>>(simKey(simulationId));
  },
};
