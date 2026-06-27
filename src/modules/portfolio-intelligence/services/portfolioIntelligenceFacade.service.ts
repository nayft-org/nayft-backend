import { cacheHelpers } from '../../../config/redis';
import { redis } from '../../../config/redis';
import { piRedisKeys } from '../cache/piRedisKeys';
import { piReadService } from './piRead.service';
import { piEvolutionService } from './piEvolution.service';
import { goalProfileService } from './goalProfile.service';
import { explainabilityComposer, type ExplainabilityBundle } from '../explainability/explainabilityComposer.service';
import {
  buildCategoryAffinityFromPortfolio,
  FEED_INTELLIGENCE_SCHEMA_VERSION,
  type FeedIntelligenceContract,
} from '../contracts/feedIntelligenceContract';
import {
  AI_ANALYST_CONTEXT_SCHEMA_VERSION,
  buildAiAnalystDisclaimers,
  type AiAnalystContextContract,
} from '../contracts/aiAnalystContextContract';
import type { PortfolioAnalyticsPayloadV2 } from '../contracts/piEngineContracts';
import { confidenceToUnit } from '../engines/confidence/portfolioConfidence.engine';
import { DEFAULT_NARRATIVE_MOMENTUM } from '../engines/narrative/narrativeIntelligence.engine';

async function loadPayload(userId: string): Promise<PortfolioAnalyticsPayloadV2 | null> {
  return piReadService.getAnalyticsPayload(userId);
}

export const portfolioIntelligenceFacade = {
  async getUnifiedSummary(userId: string) {
    return piReadService.getSummary(userId);
  },

  async getAnalyticsPayload(userId: string) {
    return loadPayload(userId);
  },

  async getContext(userId: string) {
    return piReadService.getContext(userId);
  },

  async getSlice<K extends keyof PortfolioAnalyticsPayloadV2>(
    userId: string,
    key: K
  ): Promise<PortfolioAnalyticsPayloadV2[K] | null> {
    const payload = await loadPayload(userId);
    return payload ? payload[key] : null;
  },

  async getConfidence(userId: string) {
    const payload = await loadPayload(userId);
    if (!payload?.confidence) return null;
    return {
      ...payload.confidence,
      portfolioUnit: confidenceToUnit(payload.confidence.portfolio),
    };
  },

  async getExplainability(userId: string, engineId?: string) {
    const payload = await loadPayload(userId);
    if (!payload?.explainability) return engineId ? null : {};
    if (engineId) return payload.explainability[engineId] ?? null;
    return payload.explainability;
  },

  async getBenchmarks(userId: string) {
    const payload = await loadPayload(userId);
    return payload?.benchmarks ?? null;
  },

  async getOpportunities(userId: string) {
    const payload = await loadPayload(userId);
    return payload?.opportunities ?? [];
  },

  async getEvolution(userId: string, days: 30 | 90 = 30) {
    return piEvolutionService.getEvolution(userId, days);
  },

  async getHistoricalTimeline(userId: string, dimension: string, days: 30 | 90 = 30) {
    return piEvolutionService.getHistoricalTimeline(userId, dimension, days);
  },

  async getNarrativeIntel(userId: string) {
    const payload = await loadPayload(userId);
    return payload?.narrativeIntel ?? null;
  },

  async getFeedIntelligenceContext(userId: string): Promise<FeedIntelligenceContract | null> {
    const cacheKey = `pi:feed-intel:${userId}`;
    const cached = await cacheHelpers.get<FeedIntelligenceContract>(cacheKey);
    if (cached) return cached;

    const [payload, ctx, goal] = await Promise.all([
      loadPayload(userId),
      piReadService.getContext(userId),
      goalProfileService.getGoalProfile(userId),
    ]);
    const revisionRaw = await redis.get(piRedisKeys.userRevision(userId));

    if (!payload) return null;

    const momentum: Record<string, number> = {};
    for (const [id, snap] of Object.entries(DEFAULT_NARRATIVE_MOMENTUM)) {
      momentum[id] = snap.momentum;
    }
    if (payload.narrativeIntel?.momentum) {
      Object.assign(momentum, payload.narrativeIntel.momentum);
    }

    const contract: FeedIntelligenceContract = {
      schemaVersion: FEED_INTELLIGENCE_SCHEMA_VERSION,
      revision: parseInt(revisionRaw || '0', 10) || 0,
      stale: ctx.stale,
      portfolioConfidence: confidenceToUnit(payload.confidence?.portfolio ?? 800),
      heldSymbols: ctx.heldSymbols,
      weightBySymbol: ctx.weightBySymbol,
      narrativeVector: payload.feedIntel?.narrativeVector ?? {},
      convictionVector: payload.feedIntel?.convictionVector ?? {},
      narrativeMomentum: momentum,
      identityPrimaryId: payload.identity?.primary?.id ?? 'unknown',
      goalProfileId: goal.goalProfileId,
      categoryAffinityFromPortfolio: buildCategoryAffinityFromPortfolio(payload.allocation?.byCategory ?? {}),
      topOpportunityNarratives: (payload.opportunities ?? [])
        .filter((o) => o.type.includes('narrative'))
        .slice(0, 3)
        .map((o) => String(o.evidence.narrativeId ?? o.title)),
    };

    await cacheHelpers.set(cacheKey, contract, 30);
    return contract;
  },

  async getAiAnalystContext(userId: string): Promise<AiAnalystContextContract | null> {
    const payload = await loadPayload(userId);
    if (!payload) return null;

    const [goal, feedIntel] = await Promise.all([
      goalProfileService.getGoalProfile(userId),
      this.getFeedIntelligenceContext(userId),
    ]);

    const explainability: ExplainabilityBundle =
      (payload.explainability as ExplainabilityBundle | undefined) ??
      explainabilityComposer.compose(payload, {
        correlationId: payload.correlationId,
        catalogVersion: payload.replayPin.catalogVersion,
        taxonomyVersion: payload.taxonomyVersion,
      });

    const portfolioConfidence = payload.confidence?.portfolio ?? 800;

    return {
      schemaVersion: AI_ANALYST_CONTEXT_SCHEMA_VERSION,
      userId,
      computedAt: payload.computedAt,
      correlationId: payload.correlationId,
      partial: payload.partial,
      portfolioConfidence,
      goalProfileId: goal.goalProfileId,
      summary: {
        healthScore: payload.health?.healthScore ?? null,
        healthLabel: payload.health?.healthLabel ?? 'Unknown',
        riskScore: payload.risk?.riskScore ?? 0,
        riskLabel: payload.risk?.riskLabel ?? 'Unknown',
        identity: payload.identity?.primary ?? { id: 'unknown', name: 'Unknown', confidence: 0 },
        topCategory: payload.allocation?.topCategory ?? { id: 'Other', name: 'Other', pct: 0 },
        mappingCoveragePct: payload.telemetry?.mappingCoveragePct ?? 0,
      },
      allocation: payload.allocation,
      narrative: payload.narrative,
      insights: payload.insights,
      opportunities: payload.opportunities ?? [],
      explainability,
      feedIntel: feedIntel ?? {
        schemaVersion: FEED_INTELLIGENCE_SCHEMA_VERSION,
        revision: 0,
        stale: true,
        portfolioConfidence: 0,
        heldSymbols: [],
        weightBySymbol: {},
        narrativeVector: {},
        convictionVector: {},
        narrativeMomentum: {},
        identityPrimaryId: 'unknown',
        goalProfileId: goal.goalProfileId,
        categoryAffinityFromPortfolio: {},
        topOpportunityNarratives: [],
      },
      replayPin: payload.replayPin,
      disclaimers: buildAiAnalystDisclaimers(payload.partial, portfolioConfidence),
    };
  },
};
