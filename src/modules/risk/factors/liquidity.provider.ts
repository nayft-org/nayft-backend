import { riskConfig } from '../config/riskConfig';
import type { FactorRawResult } from '../types/factorTypes';
import type { FactorBuildContext } from './factorContext';
import { roundRaw, roundConfidence } from '../utils/round';
import { liquidityMarketCapMultiplier } from '../confidence/staleness';

export function computeLiquidityRaw(symbol: string, ctx: FactorBuildContext): FactorRawResult {
  const buildCutoffTime = ctx.buildCutoffTime;
  const market = ctx.marketBySymbol.get(symbol);
  const ohlc = ctx.ohlcBySymbol.get(symbol);

  const volume = market?.total_volume || 0;
  const mcap = market?.market_cap || 0;
  let raw = 0.5;

  if (volume > 0 && mcap > 0) {
    const turnover = volume / mcap;
    raw = roundRaw(Math.min(1, 1 / (1 + turnover * 100)));
  } else if (ohlc && ohlc.volumes.length > 1) {
    const mean = ohlc.volumes.reduce((a, b) => a + b, 0) / ohlc.volumes.length;
    const variance =
      ohlc.volumes.reduce((a, b) => a + (b - mean) ** 2, 0) / ohlc.volumes.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    raw = roundRaw(Math.min(1, cv));
  }

  const confidence = roundConfidence(0.5 * liquidityMarketCapMultiplier(mcap) + (ohlc ? 0.3 : 0));
  return {
    raw,
    confidence,
    flags: ohlc ? ['ohlc_volume'] : ['market_volume'],
    factorSnapshotTime: buildCutoffTime,
    buildCutoffTime,
    stalenessMs: 0,
    invalid: confidence < riskConfig.confidenceInvalidThreshold,
  };
}
