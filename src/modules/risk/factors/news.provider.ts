import { loadLatestCoinSentiment } from '../services/newsFactor.service';
import { applyNewsFactorGating } from '../services/newsFactorLogic';
import { riskConfig } from '../config/riskConfig';
import type { FactorRawResult } from '../types/factorTypes';
import type { FactorBuildContext } from './factorContext';
import { roundRaw, roundConfidence } from '../utils/round';

export async function computeNewsRaw(
  symbol: string,
  ctx: FactorBuildContext
): Promise<FactorRawResult> {
  const buildCutoffTime = ctx.buildCutoffTime;
  const snap = await loadLatestCoinSentiment(symbol);
  const gated = applyNewsFactorGating(symbol, snap, {
    rrsEnabled: riskConfig.sentimentRrsEnabled,
    nowMs: buildCutoffTime.getTime(),
  });

  const snapshotTime = gated.computedAt ? new Date(gated.computedAt) : buildCutoffTime;
  const stalenessMs = gated.computedAt
    ? Math.max(0, buildCutoffTime.getTime() - Date.parse(gated.computedAt))
    : 0;

  const raw = roundRaw(gated.newsRaw);
  const confidence = roundConfidence(gated.confidence);
  const invalid =
    gated.flags.includes('disabled') ||
    gated.flags.includes('no_news') ||
    confidence < riskConfig.confidenceInvalidThreshold;

  return {
    raw,
    confidence,
    flags: gated.flags,
    factorSnapshotTime: snapshotTime,
    buildCutoffTime,
    stalenessMs,
    invalid,
  };
}
