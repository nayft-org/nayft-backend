import { roundHalfUp } from '../math/piMath';
import type { PortfolioAnalyticsPayloadV2 } from '../../contracts/piEngineContracts';

export type PortfolioConfidenceResult = {
  portfolio: number;
  analytics: number;
  identity: number;
  risk: number;
  propagated: {
    insightSeverityCap?: string;
    healthSuppressed?: boolean;
    riskLabelSuffix?: string;
  };
};

function clamp1000(n: number): number {
  return Math.max(0, Math.min(1000, roundHalfUp(n)));
}

export function runPortfolioConfidence(params: {
  payload: PortfolioAnalyticsPayloadV2;
  mappingCoveragePct: number;
  holdingsFreshnessScore?: number;
  crsCoveragePct?: number;
}): PortfolioConfidenceResult {
  const { payload, mappingCoveragePct } = params;
  const freshness = params.holdingsFreshnessScore ?? 800;
  const crsCoverage = params.crsCoveragePct ?? mappingCoveragePct;

  const mappingScore = clamp1000(mappingCoveragePct * 1000);
  const portfolio = clamp1000(0.5 * mappingScore + 0.3 * freshness + 0.2 * (payload.partial ? 400 : 900));

  let analytics = 1000;
  if (payload.partial) analytics -= 300;
  if (payload.engineErrors?.length) analytics -= payload.engineErrors.length * 150;
  if ((payload.allocation?.categoryCount ?? 0) < 1) analytics -= 200;
  analytics = clamp1000(analytics);

  const identityConf = payload.identity?.primary?.confidence ?? 0;
  const identity = clamp1000(identityConf * 1000 * mappingCoveragePct);

  const risk = clamp1000(0.6 * mappingScore + 0.4 * crsCoverage * 1000);

  const propagated: PortfolioConfidenceResult['propagated'] = {};
  if (portfolio < 400) propagated.insightSeverityCap = 'info';
  if (analytics < 500) propagated.healthSuppressed = true;
  if (risk < 500) propagated.riskLabelSuffix = 'low confidence';

  return { portfolio, analytics, identity, risk, propagated };
}

export function confidenceToUnit(score: number): number {
  return roundHalfUp(score / 10) / 100;
}
