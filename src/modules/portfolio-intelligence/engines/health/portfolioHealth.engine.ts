import { roundHalfUp } from '../math/piMath';

function concentrationSubScore(topHoldingPct: number): number {
  if (topHoldingPct <= 0) return 100;
  if (topHoldingPct >= 70) return 20;
  return roundHalfUp(100 - ((topHoldingPct / 70) * 80));
}

export function runPortfolioHealth(params: {
  riskTenths: number;
  diversificationScore: number;
  topHoldingPct: number;
  stablecoinPct: number;
}) {
  const riskSub = roundHalfUp(100 - (params.riskTenths / 10) * 100);
  const diversificationSub = params.diversificationScore;
  const concentrationSub = concentrationSubScore(params.topHoldingPct);
  const stablecoinSub = Math.min(100, roundHalfUp(params.stablecoinPct * 5));

  const healthScore = roundHalfUp(
    0.4 * riskSub + 0.3 * diversificationSub + 0.2 * concentrationSub + 0.1 * stablecoinSub
  );

  let healthLabel = 'Excellent';
  if (healthScore < 40) healthLabel = 'Weak';
  else if (healthScore < 60) healthLabel = 'Fair';
  else if (healthScore < 80) healthLabel = 'Strong';

  return {
    healthScore,
    healthLabel,
    breakdown: { risk: riskSub, diversification: diversificationSub, concentration: concentrationSub, stablecoin: stablecoinSub },
    explain: {
      weights: { risk: 0.4, diversification: 0.3, concentration: 0.2, stablecoin: 0.1 },
      subScores: { risk: riskSub, diversification: diversificationSub, concentration: concentrationSub, stablecoin: stablecoinSub },
    },
  };
}

export const NEUTRAL_HEALTH = {
  healthScore: null as number | null,
  healthLabel: 'Unknown',
  breakdown: { risk: 0, diversification: 0, concentration: 0, stablecoin: 0 },
  explain: { weights: {}, subScores: {} },
};
