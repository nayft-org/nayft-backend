import { riskConfig } from '../config/riskConfig';
import type { FactorRawResult } from '../types/factorTypes';
import type { FactorBuildContext } from './factorContext';
import { roundRaw, roundConfidence } from '../utils/round';
import { applyStalenessConfidence } from '../confidence/staleness';

function parkinsonVol(highs: number[], lows: number[]): number {
  if (highs.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < highs.length; i++) {
    const h = highs[i];
    const l = lows[i];
    if (h > 0 && l > 0 && h >= l) {
      const r = Math.log(h / l);
      sum += r * r;
      count += 1;
    }
  }
  if (count === 0) return 0;
  return Math.sqrt(sum / (4 * count * Math.LN2));
}

export function computeVolatilityRaw(symbol: string, ctx: FactorBuildContext): FactorRawResult {
  const buildCutoffTime = ctx.buildCutoffTime;
  const ohlc = ctx.ohlcBySymbol.get(symbol);
  const market = ctx.marketBySymbol.get(symbol);

  if (ohlc && ohlc.closes.length >= 5) {
    const vol = parkinsonVol(ohlc.highs, ohlc.lows);
    const stalenessMs = Math.max(0, buildCutoffTime.getTime() - ohlc.lastOpenTime.getTime());
    const stale = applyStalenessConfidence(1, stalenessMs, riskConfig.ohlcStaleMs);
    return {
      raw: roundRaw(vol),
      confidence: roundConfidence(stale.confidence * Math.min(1, ohlc.closes.length / 30)),
      flags: [...stale.flags, 'ohlc'],
      factorSnapshotTime: ohlc.lastOpenTime,
      buildCutoffTime,
      stalenessMs,
      invalid: stale.invalid,
    };
  }

  const pct = Math.abs(market?.price_change_percentage_24h ?? 0) / 100;
  const raw = roundRaw(Math.min(1, pct * 5));
  const flags = ['proxy_24h_return'];
  return {
    raw,
    confidence: roundConfidence(0.25),
    flags,
    factorSnapshotTime: buildCutoffTime,
    buildCutoffTime,
    stalenessMs: 0,
    invalid: false,
  };
}
