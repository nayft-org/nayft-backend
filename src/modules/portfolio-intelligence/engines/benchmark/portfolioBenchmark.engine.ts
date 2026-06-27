import { createHash } from 'crypto';
import { roundHalfUp } from '../math/piMath';
import type { PortfolioAnalyticsPayloadV2 } from '../../contracts/piEngineContracts';

export type BenchmarkMetricResult = {
  value: number;
  percentile: number;
  cohortSize: number;
  cohortId: string;
};

export type PortfolioBenchmarkResult = {
  cohortId: string;
  cohortSize: number;
  healthPercentile: number;
  riskPercentile: number;
  diversificationPercentile: number;
  categoryPercentiles: Record<string, number>;
};

const DEFAULT_COHORT_STATS = {
  healthScore: { p25: 45, p50: 62, p75: 78, mean: 60, stddev: 15 },
  riskScore: { p25: 3, p50: 5.5, p75: 7.5, mean: 5.5, stddev: 2 },
  diversificationScore: { p25: 35, p50: 55, p75: 72, mean: 52, stddev: 18 },
};

function percentileFromValue(value: number, p25: number, p50: number, p75: number): number {
  if (value <= p25) return roundHalfUp((value / Math.max(p25, 1)) * 25);
  if (value <= p50) return roundHalfUp(25 + ((value - p25) / Math.max(p50 - p25, 0.01)) * 25);
  if (value <= p75) return roundHalfUp(50 + ((value - p50) / Math.max(p75 - p50, 0.01)) * 25);
  return roundHalfUp(75 + Math.min(24, ((value - p75) / Math.max(p75, 1)) * 25));
}

export function buildCohortId(params: {
  portfolioValueBand: string;
  identityPrimaryId: string;
  goalProfileId: string;
  multiWallet: boolean;
}): string {
  const raw = `${params.portfolioValueBand}|${params.identityPrimaryId}|${params.goalProfileId}|${params.multiWallet}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function valueBand(totalUsd: number): string {
  if (totalUsd < 1000) return 'micro';
  if (totalUsd < 10_000) return 'small';
  if (totalUsd < 100_000) return 'mid';
  return 'large';
}

export function runPortfolioBenchmark(params: {
  payload: PortfolioAnalyticsPayloadV2;
  totalValueUsd: number;
  goalProfileId: string;
  multiWallet: boolean;
  cohortSize?: number;
}): PortfolioBenchmarkResult {
  const band = valueBand(params.totalValueUsd);
  const identityId = params.payload.identity?.primary?.id ?? 'unknown';
  const cohortId = buildCohortId({
    portfolioValueBand: band,
    identityPrimaryId: identityId,
    goalProfileId: params.goalProfileId,
    multiWallet: params.multiWallet,
  });
  const cohortSize = params.cohortSize ?? 100;

  const stats = DEFAULT_COHORT_STATS;
  const healthVal = params.payload.health?.healthScore ?? 0;
  const riskVal = params.payload.risk?.riskScore ?? 0;
  const divVal = params.payload.diversification?.score ?? 0;

  const categoryPercentiles: Record<string, number> = {};
  for (const [bucket, pct] of Object.entries(params.payload.allocation?.byCategory ?? {})) {
    categoryPercentiles[bucket] = percentileFromValue(pct, 5, 15, 30);
  }

  return {
    cohortId,
    cohortSize,
    healthPercentile: percentileFromValue(
      healthVal,
      stats.healthScore.p25,
      stats.healthScore.p50,
      stats.healthScore.p75
    ),
    riskPercentile: percentileFromValue(
      riskVal,
      stats.riskScore.p25,
      stats.riskScore.p50,
      stats.riskScore.p75
    ),
    diversificationPercentile: percentileFromValue(
      divVal,
      stats.diversificationScore.p25,
      stats.diversificationScore.p50,
      stats.diversificationScore.p75
    ),
    categoryPercentiles,
  };
}
