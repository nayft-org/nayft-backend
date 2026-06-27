import type { ExplainabilityBundle } from '../explainability/explainabilityComposer.service';
import type { PortfolioAnalyticsPayloadV2 } from './piEngineContracts';
import type { FeedIntelligenceContract } from './feedIntelligenceContract';

export const AI_ANALYST_CONTEXT_SCHEMA_VERSION = 1;

export type AiAnalystContextContract = {
  schemaVersion: typeof AI_ANALYST_CONTEXT_SCHEMA_VERSION;
  userId: string;
  computedAt: string;
  correlationId: string;
  partial: boolean;
  portfolioConfidence: number;
  goalProfileId: string;
  summary: {
    healthScore: number | null;
    healthLabel: string;
    riskScore: number;
    riskLabel: string;
    identity: { id: string; name: string; confidence: number };
    topCategory: { id: string; name: string; pct: number };
    mappingCoveragePct: number;
  };
  allocation: PortfolioAnalyticsPayloadV2['allocation'];
  narrative: PortfolioAnalyticsPayloadV2['narrative'];
  insights: PortfolioAnalyticsPayloadV2['insights'];
  opportunities: PortfolioAnalyticsPayloadV2['opportunities'];
  explainability: ExplainabilityBundle;
  feedIntel: FeedIntelligenceContract;
  replayPin: PortfolioAnalyticsPayloadV2['replayPin'];
  disclaimers: string[];
};

export function buildAiAnalystDisclaimers(partial: boolean, portfolioConfidence: number): string[] {
  const disclaimers = [
    'This is informational analysis, not financial advice.',
    'Past performance does not guarantee future results.',
  ];
  if (partial) disclaimers.push('Analytics are partial — some holdings could not be categorized.');
  if (portfolioConfidence < 500) {
    disclaimers.push('Low portfolio confidence — treat recommendations with caution.');
  }
  return disclaimers;
}
