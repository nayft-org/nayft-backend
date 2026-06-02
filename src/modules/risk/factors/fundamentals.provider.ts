import { riskConfig } from '../config/riskConfig';
import type { FactorRawResult } from '../types/factorTypes';
import type { FactorBuildContext } from './factorContext';
import { roundRaw, roundConfidence } from '../utils/round';
import { applyStalenessConfidence, liquidityMarketCapMultiplier } from '../confidence/staleness';

export function computeFundamentalsRaw(
  symbol: string,
  ctx: FactorBuildContext
): FactorRawResult {
  const row = ctx.marketBySymbol.get(symbol);
  const buildCutoffTime = ctx.buildCutoffTime;
  const flags: string[] = [];

  if (!row?.market_cap) {
    return {
      raw: 0,
      confidence: 0,
      flags: ['missing_market_cap'],
      factorSnapshotTime: buildCutoffTime,
      buildCutoffTime,
      stalenessMs: 0,
      invalid: true,
    };
  }

  const mcap = row.market_cap;
  const fdv = row.fully_diluted_valuation || mcap;
  const fdvStress = fdv > 0 ? Math.min(2, fdv / mcap) - 1 : 0;
  const rankStress = row.market_cap_rank ? Math.min(1, row.market_cap_rank / 5000) : 0.5;
  const raw = roundRaw(0.5 * fdvStress + 0.5 * rankStress);

  const snapshotTime = row.last_updated ? new Date(row.last_updated) : buildCutoffTime;
  const stalenessMs = Math.max(0, buildCutoffTime.getTime() - snapshotTime.getTime());
  const stale = applyStalenessConfidence(1, stalenessMs, riskConfig.marketStaleMs);
  const liqMult = liquidityMarketCapMultiplier(mcap);
  const confidence = roundConfidence(stale.confidence * liqMult);

  return {
    raw,
    confidence,
    flags: [...flags, ...stale.flags],
    factorSnapshotTime: snapshotTime,
    buildCutoffTime,
    stalenessMs,
    invalid: stale.invalid || confidence < riskConfig.confidenceInvalidThreshold,
  };
}
