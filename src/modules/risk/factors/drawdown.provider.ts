import type { FactorRawResult } from '../types/factorTypes';
import type { FactorBuildContext } from './factorContext';
import { roundRaw, roundConfidence } from '../utils/round';

function maxDrawdown(closes: number[]): number {
  if (closes.length < 2) return 0;
  let peak = closes[0];
  let maxDd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = peak > 0 ? (peak - c) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export function computeDrawdownRaw(symbol: string, ctx: FactorBuildContext): FactorRawResult {
  const buildCutoffTime = ctx.buildCutoffTime;
  const ohlc = ctx.ohlcBySymbol.get(symbol);
  const market = ctx.marketBySymbol.get(symbol);

  if (ohlc && ohlc.closes.length >= 5) {
    const dd = maxDrawdown(ohlc.closes);
    return {
      raw: roundRaw(dd),
      confidence: roundConfidence(Math.min(1, ohlc.closes.length / 30)),
      flags: ['ohlc'],
      factorSnapshotTime: ohlc.lastOpenTime,
      buildCutoffTime,
      stalenessMs: Math.max(0, buildCutoffTime.getTime() - ohlc.lastOpenTime.getTime()),
      invalid: false,
    };
  }

  const pct = market?.price_change_percentage_24h ?? 0;
  const raw = roundRaw(pct < 0 ? Math.min(1, Math.abs(pct) / 50) : 0);
  return {
    raw,
    confidence: roundConfidence(0.2),
    flags: ['proxy_24h'],
    factorSnapshotTime: buildCutoffTime,
    buildCutoffTime,
    stalenessMs: 0,
    invalid: false,
  };
}
