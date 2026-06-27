export const FEED_INTELLIGENCE_SCHEMA_VERSION = 1;

export type FeedIntelligenceContract = {
  schemaVersion: typeof FEED_INTELLIGENCE_SCHEMA_VERSION;
  revision: number;
  stale: boolean;
  portfolioConfidence: number;
  heldSymbols: string[];
  weightBySymbol: Record<string, number>;
  narrativeVector: Record<string, number>;
  convictionVector: Record<string, number>;
  narrativeMomentum: Record<string, number>;
  identityPrimaryId: string;
  goalProfileId: string;
  categoryAffinityFromPortfolio: Record<string, number>;
  topOpportunityNarratives: string[];
};

export function buildCategoryAffinityFromPortfolio(
  byCategory: Record<string, number>
): Record<string, number> {
  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
  if (total <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(byCategory)) {
    out[k] = v / total;
  }
  return out;
}
