import { createHash } from 'crypto';
import { roundHalfUp } from '../math/piMath';
import type { PortfolioAnalyticsPayloadV2 } from '../../contracts/piEngineContracts';
import type { GoalProfileId } from '../../services/goalProfile.service';

export type PiOpportunity = {
  id: string;
  type: string;
  priority: number;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  confidence: number;
  goalAdapted: boolean;
  disclaimer: boolean;
};

function stableId(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12);
}

export function runOpportunityDetection(params: {
  payload: PortfolioAnalyticsPayloadV2;
  goalProfileId: GoalProfileId;
  portfolioConfidence: number;
  narrativeMomentum?: Record<string, number>;
}): PiOpportunity[] {
  const { payload, goalProfileId, portfolioConfidence } = params;
  const momentum = params.narrativeMomentum ?? {};
  const opportunities: PiOpportunity[] = [];
  const conf = roundHalfUp(portfolioConfidence / 10) / 100;

  const topHoldingPct = payload.concentration?.topHoldingPct ?? 0;
  const divScore = payload.diversification?.score ?? 0;
  const hhi = payload.concentration?.hhi ?? 0;

  if (topHoldingPct > 40 && divScore < 50) {
    opportunities.push({
      id: stableId(['rebalance', payload.concentration.topHolding, String(topHoldingPct)]),
      type: 'rebalance',
      priority: 80,
      title: 'Concentration rebalance candidate',
      summary: `${payload.concentration.topHolding} represents ${topHoldingPct.toFixed(1)}% of portfolio with low diversification.`,
      evidence: { topHoldingPct, divScore, symbol: payload.concentration.topHolding },
      confidence: conf,
      goalAdapted: goalProfileId === 'capital_preservation',
      disclaimer: true,
    });
  }

  if (hhi > 0.25 || topHoldingPct > 50) {
    opportunities.push({
      id: stableId(['imbalance', payload.allocation.topCategory.id]),
      type: 'imbalance',
      priority: 70,
      title: 'Portfolio imbalance detected',
      summary: `High concentration in ${payload.allocation.topCategory.name} (${payload.allocation.topCategory.pct.toFixed(1)}%).`,
      evidence: { hhi, topCategory: payload.allocation.topCategory },
      confidence: conf,
      goalAdapted: goalProfileId !== 'aggressive_growth',
      disclaimer: true,
    });
  }

  for (const [narrativeId, mom] of Object.entries(momentum)) {
    const userPct = payload.narrative?.vector?.[narrativeId] ?? 0;
    if (mom > 0.3 && userPct < 5) {
      opportunities.push({
        id: stableId(['missing_narrative', narrativeId]),
        type: 'missing_narrative',
        priority: 60,
        title: `Underexposed to ${narrativeId}`,
        summary: `Market momentum is rising for ${narrativeId} but your allocation is ${userPct.toFixed(1)}%.`,
        evidence: { narrativeId, marketMomentum: mom, userPct },
        confidence: conf,
        goalAdapted: goalProfileId === 'narrative_investing',
        disclaimer: true,
      });
    }
    const conviction = userPct / 100;
    if (mom > 0.2 && conviction < 0.1) {
      opportunities.push({
        id: stableId(['narrative_expansion', narrativeId]),
        type: 'narrative_expansion',
        priority: 55,
        title: `${narrativeId} expansion opportunity`,
        summary: `Rising narrative with low conviction gap (${(mom - conviction).toFixed(2)}).`,
        evidence: { narrativeId, momentum: mom, convictionGap: mom - conviction },
        confidence: conf,
        goalAdapted: goalProfileId === 'narrative_investing',
        disclaimer: true,
      });
    }
  }

  const goalTargets: Partial<Record<GoalProfileId, Record<string, number>>> = {
    capital_preservation: { Stablecoins: 30, Bitcoin: 10 },
    yield_generation: { DeFi: 25 },
    narrative_investing: { AI: 15 },
  };
  const targets = goalTargets[goalProfileId] ?? {};
  for (const [bucket, targetPct] of Object.entries(targets)) {
    const currentPct = payload.allocation?.byCategory?.[bucket] ?? 0;
    if (currentPct < targetPct * 0.5) {
      opportunities.push({
        id: stableId(['category_gap', bucket, goalProfileId]),
        type: 'category_gap',
        priority: 50,
        title: `${bucket} category gap`,
        summary: `Your ${bucket} allocation (${currentPct.toFixed(1)}%) is below goal target (${targetPct}%).`,
        evidence: { bucket, targetPct, currentPct, goalProfileId },
        confidence: conf,
        goalAdapted: true,
        disclaimer: true,
      });
    }
  }

  return opportunities
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
}
