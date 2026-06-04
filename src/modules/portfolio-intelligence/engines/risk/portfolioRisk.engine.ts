import { loadCategoryRiskV1 } from '../../config/piFormulaRegistry';
import { riskScoreTenthsFromBps, tenthsToScore, bpsToPct1 } from '../math/piMath';
import type { PipelineState } from '../../contracts/piEngineContracts';

export function runPortfolioRisk(state: PipelineState) {
  const risk = loadCategoryRiskV1();
  const tenths = riskScoreTenthsFromBps(state.allocationBps, risk.weights);
  const riskScore = tenthsToScore(tenths);
  let riskLabel = 'Extreme';
  for (const row of risk.labels) {
    if (tenths <= row.maxTenths) {
      riskLabel = row.label;
      break;
    }
  }

  const contributions = Object.entries(state.allocationBps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([categoryId, bps]) => {
      const riskWeight = risk.weights[categoryId] ?? risk.weights.Other ?? 6;
      const contribution = (bps / 10000) * riskWeight;
      return {
        categoryId,
        weightPct: bpsToPct1(bps),
        riskWeight,
        contribution: Math.round(contribution * 100) / 100,
      };
    });

  return {
    riskScore,
    riskLabel,
    contributions,
    explain: { formula: 'weighted_category_risk_v1' },
    riskTenths: tenths,
  };
}

export const NEUTRAL_RISK = {
  riskScore: 0,
  riskLabel: 'Unknown',
  contributions: [] as Array<{ categoryId: string; weightPct: number; riskWeight: number; contribution: number }>,
  explain: { formula: 'neutral' },
  riskTenths: 0,
};
