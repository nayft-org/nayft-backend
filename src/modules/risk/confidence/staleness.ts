import { riskConfig } from '../config/riskConfig';
import { roundConfidence } from '../utils/round';

export function stalenessMultiplier(ageMs: number, thresholdMs: number): number {
  const ratio = ageMs / thresholdMs;
  if (ratio <= 1) return 1;
  if (ratio <= 2) return 0.7;
  if (ratio <= 4) return 0.4;
  return 0;
}

export function applyStalenessConfidence(
  baseConfidence: number,
  ageMs: number,
  thresholdMs: number
): { confidence: number; invalid: boolean; flags: string[] } {
  const mult = stalenessMultiplier(ageMs, thresholdMs);
  const flags: string[] = [];
  if (mult === 0) {
    flags.push('stale');
    return { confidence: 0, invalid: true, flags };
  }
  const confidence = roundConfidence(baseConfidence * mult);
  if (confidence < riskConfig.confidenceInvalidThreshold) {
    return { confidence, invalid: true, flags: [...flags, 'low_confidence'] };
  }
  return { confidence, invalid: false, flags };
}

export function liquidityMarketCapMultiplier(marketCap?: number): number {
  if (!marketCap || marketCap < riskConfig.marketCapFloor) return 0.3;
  if (marketCap < riskConfig.marketCapFloor * 10) return 0.6;
  return 1;
}
