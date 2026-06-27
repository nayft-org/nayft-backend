import type { PortfolioAnalyticsPayloadV2 } from '../../contracts/piEngineContracts';

export type NarrativeIntelSnapshot = Record<
  string,
  {
    momentum: number;
    acceleration: number;
    decay: number;
    newsScore: number;
    articleCount7d: number;
    sentimentAvg: number;
  }
>;

export type NarrativeIntelResult = {
  exposure: Record<string, number>;
  conviction: Record<string, number>;
  momentum: Record<string, number>;
  topConvictionGaps: Array<{ narrativeId: string; gap: number }>;
};

export function runNarrativeIntelligence(params: {
  payload: PortfolioAnalyticsPayloadV2;
  marketSnapshot?: NarrativeIntelSnapshot;
}): NarrativeIntelResult {
  const exposure = params.payload.narrative?.vector ?? {};
  const momentum: Record<string, number> = {};
  const conviction: Record<string, number> = {};
  const gaps: Array<{ narrativeId: string; gap: number }> = [];

  for (const [narrativeId, pct] of Object.entries(exposure)) {
    const mom = params.marketSnapshot?.[narrativeId]?.momentum ?? 0;
    momentum[narrativeId] = mom;
    conviction[narrativeId] = (pct / 100) * (1 + mom);
    if (mom > 0.2 && pct < 10) {
      gaps.push({ narrativeId, gap: mom - pct / 100 });
    }
  }

  gaps.sort((a, b) => b.gap - a.gap);

  return {
    exposure,
    conviction,
    momentum,
    topConvictionGaps: gaps.slice(0, 5),
  };
}

export const DEFAULT_NARRATIVE_MOMENTUM: NarrativeIntelSnapshot = {
  AI: { momentum: 0.35, acceleration: 1.2, decay: 0, newsScore: 0.6, articleCount7d: 120, sentimentAvg: 0.55 },
  DeFi: { momentum: 0.15, acceleration: 0.9, decay: 0.05, newsScore: 0.4, articleCount7d: 80, sentimentAvg: 0.5 },
  Memes: { momentum: -0.1, acceleration: 0.7, decay: 0.2, newsScore: 0.3, articleCount7d: 45, sentimentAvg: 0.45 },
};
