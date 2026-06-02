import { riskConfig } from '../config/riskConfig';
import type { RiskFactorName, FactorRawResult, NormalizedFactorResult, CrsResult } from '../types/factorTypes';
import { roundCrs, roundConfidence } from '../utils/round';

const FACTOR_ORDER: RiskFactorName[] = [
  'volatility',
  'liquidity',
  'drawdown',
  'fundamentals',
  'news',
];

export function composeCrs(
  _symbol: string,
  normalized: Record<RiskFactorName, NormalizedFactorResult>,
  raw: Record<RiskFactorName, FactorRawResult>
): CrsResult {
  let weightSum = 0;
  let crsSum = 0;
  const flags: string[] = [];

  for (const factor of FACTOR_ORDER) {
    const baseWeight = riskConfig.crsWeights[factor];
    const r = raw[factor];
    const n = normalized[factor];
    if (r.invalid || r.confidence < riskConfig.confidenceInvalidThreshold) {
      flags.push(`invalid_${factor}`);
      continue;
    }
    const effectiveWeight = baseWeight * r.confidence;
    weightSum += effectiveWeight;
    crsSum += effectiveWeight * n.normalized;
  }

  if (weightSum <= 0) {
    return {
      crs: 0.5,
      crsRaw: 0.5,
      rank: 0,
      percentile: 0.5,
      confidence: 0,
      flags: [...flags, 'no_valid_factors'],
    };
  }

  const crsRaw = crsSum / weightSum;
  const crs = roundCrs(crsRaw);
  const confidence = roundConfidence(
    FACTOR_ORDER.reduce((s, f) => s + (raw[f].invalid ? 0 : raw[f].confidence), 0) /
      FACTOR_ORDER.filter((f) => !raw[f].invalid).length || 0
  );

  return { crs, crsRaw, rank: 0, percentile: 0, confidence, flags };
}

export function assignCrsRanks(results: Map<string, CrsResult>): void {
  const sorted = [...results.entries()].sort((a, b) => {
    const d = b[1].crs - a[1].crs;
    if (d !== 0) return d;
    return a[0].localeCompare(b[0], 'en', { sensitivity: 'base' });
  });
  const n = sorted.length;
  sorted.forEach(([symbol, r], idx) => {
    r.rank = idx + 1;
    r.percentile = n <= 1 ? 0.5 : roundCrs(1 - idx / (n - 1));
    results.set(symbol, r);
  });
}
