import type { RiskFactorName, NormalizedFactorResult } from '../types/factorTypes';
import type { CrsResult } from '../types/factorTypes';
import { checkNormalizationHealth } from '../normalization/crossSectionalNormalizer';

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function crsStdDev(crsMap: Map<string, CrsResult>): number {
  const values = [...crsMap.values()].map((c) => c.crs);
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function crsEntropy(crsMap: Map<string, CrsResult>): number {
  const values = [...crsMap.values()].map((c) => c.crs);
  if (values.length === 0) return 0;
  const bins = 10;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor(v * bins));
    counts[idx] += 1;
  }
  const n = values.length;
  let entropy = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / n;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function validateRiskBuild(params: {
  universeSize: number;
  priorUniverseSize?: number;
  normalizedByFactor: Map<RiskFactorName, Map<string, NormalizedFactorResult>>;
  crsMap: Map<string, CrsResult>;
  priorRevision?: number;
  nextRevision: number;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (params.universeSize < 10) {
    errors.push('universe_too_small');
  }

  for (const [factor, normMap] of params.normalizedByFactor) {
    const health = checkNormalizationHealth(normMap);
    if (!health.ok) {
      errors.push(`normalization_${factor}_${health.reason}`);
    }
  }

  const std = crsStdDev(params.crsMap);
  if (std < 0.03) errors.push('crs_low_stddev');

  const spread =
    params.crsMap.size > 0
      ? Math.max(...[...params.crsMap.values()].map((c) => c.crs)) -
        Math.min(...[...params.crsMap.values()].map((c) => c.crs))
      : 0;
  if (spread < 0.1) errors.push('crs_low_spread');

  const entropy = crsEntropy(params.crsMap);
  if (entropy < 0.5) warnings.push('crs_low_entropy');

  if (params.priorUniverseSize && params.priorUniverseSize > 0) {
    const drift = Math.abs(params.universeSize - params.priorUniverseSize) / params.priorUniverseSize;
    if (drift > 0.5) errors.push('universe_size_drift');
    else if (drift > 0.2) warnings.push('universe_size_drift');
  }

  if (
    params.priorRevision !== undefined &&
    params.nextRevision !== params.priorRevision + 1
  ) {
    errors.push('revision_gap');
  }

  return { ok: errors.length === 0, errors, warnings };
}
