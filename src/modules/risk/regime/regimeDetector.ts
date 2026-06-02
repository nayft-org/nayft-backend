import { RiskRegime } from '../models/RiskRegime';
import type { CrsResult } from '../types/factorTypes';

export type MarketRegime =
  | 'low_risk'
  | 'normal'
  | 'elevated'
  | 'panic'
  | 'euphoric';

export type RegimeDetectionResult = {
  marketRegime: MarketRegime;
  confidence: number;
  drivers: string[];
  previousRegime?: string;
};

function medianCrs(crsMap: Map<string, CrsResult>): number {
  const values = [...crsMap.values()].map((c) => c.crs).sort((a, b) => a - b);
  if (values.length === 0) return 0.5;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

export async function detectMarketRegime(
  crsMap: Map<string, CrsResult>,
  _revision: number,
  _buildId: string
): Promise<RegimeDetectionResult> {
  const med = medianCrs(crsMap);
  const drivers: string[] = [];

  const prev = await RiskRegime.findOne({ scope: 'market', scopeId: 'global' })
    .sort({ revision: -1 })
    .lean();
  const previousRegime = (prev?.regime as MarketRegime) || 'normal';

  let candidate: MarketRegime = 'normal';
  if (med > 0.8) {
    candidate = 'panic';
    drivers.push('high_median_crs');
  } else if (med > 0.65) {
    candidate = 'elevated';
    drivers.push('elevated_median_crs');
  } else if (med < 0.25) {
    candidate = 'euphoric';
    drivers.push('low_median_crs');
  } else if (med < 0.35) {
    candidate = 'low_risk';
    drivers.push('low_median_crs');
  }

  let marketRegime: MarketRegime = previousRegime;

  const enterElevated = med > 0.65;
  const exitElevated = med < 0.58;
  const enterPanic = med > 0.8;
  const exitPanic = med < 0.72;

  if (previousRegime === 'panic') {
    if (exitPanic) marketRegime = 'elevated';
    else marketRegime = 'panic';
  } else if (previousRegime === 'elevated') {
    if (enterPanic) marketRegime = 'panic';
    else if (exitElevated) marketRegime = 'normal';
    else marketRegime = 'elevated';
  } else if (previousRegime === 'normal') {
    if (enterPanic) marketRegime = 'panic';
    else if (enterElevated) marketRegime = 'elevated';
    else if (candidate === 'euphoric' || candidate === 'low_risk') marketRegime = candidate;
    else marketRegime = 'normal';
  } else {
    marketRegime = candidate;
  }

  if (previousRegime === 'panic' && marketRegime === 'normal') {
    marketRegime = 'elevated';
    drivers.push('panic_cooldown');
  }

  return {
    marketRegime,
    confidence: 0.8,
    drivers,
    previousRegime,
  };
}

export function coinRegimeFromCrs(crs: CrsResult, marketRegime: MarketRegime): string {
  if (crs.crs > 0.75) return 'elevated';
  if (crs.crs > 0.9) return 'panic';
  if (marketRegime === 'panic' && crs.crs > 0.6) return 'elevated';
  if (crs.crs < 0.25) return 'low_risk';
  return 'normal';
}

export async function persistRegimes(
  market: RegimeDetectionResult,
  crsMap: Map<string, CrsResult>,
  revision: number,
  buildId: string,
  computedAt: Date
): Promise<void> {
  await RiskRegime.create({
    scope: 'market',
    scopeId: 'global',
    regime: market.marketRegime,
    previousRegime: market.previousRegime,
    confidence: market.confidence,
    revision,
    buildId,
    computedAt,
    drivers: market.drivers,
  });

  const coinOps = [...crsMap.entries()].map(([symbol, crs]) => ({
    scope: 'coin' as const,
    scopeId: symbol,
    regime: coinRegimeFromCrs(crs, market.marketRegime),
    confidence: crs.confidence,
    revision,
    buildId,
    computedAt,
    drivers: [],
  }));

  if (coinOps.length > 0) {
    await RiskRegime.insertMany(coinOps, { ordered: false });
  }
}
