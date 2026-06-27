import { createHash } from 'crypto';
import type {
  PiEngineContext,
  PortfolioAnalyticsPayloadV2,
  PiReplayPin,
} from '../../contracts/piEngineContracts';
import { PI_ANALYTICS_SCHEMA_VERSION } from '../../contracts/piEngineContracts';
import { getActiveFormulaBundle, formulaBundleFingerprint } from '../../config/piFormulaRegistry';
import { runCategoryAllocation, initPipelineState } from '../allocation/categoryAllocation.engine';
import { runPortfolioRisk, NEUTRAL_RISK } from '../risk/portfolioRisk.engine';
import { runNarrativeExposure, NEUTRAL_NARRATIVE } from '../narrative/narrativeExposure.engine';
import { runConcentration } from '../concentration/concentration.engine';
import { runDiversification } from '../diversification/diversification.engine';
import { runStablecoinBuffer } from '../stablecoin/stablecoinBuffer.engine';
import { runPortfolioHealth, NEUTRAL_HEALTH } from '../health/portfolioHealth.engine';
import { runPortfolioIdentity } from '../identity/portfolioIdentity.engine';
import { runInsightGeneration } from '../insights/insightGeneration.engine';
import { mapCategoryToNayftBucket } from '../taxonomy/mapToNayftBucket';
import type { NormalizedPosition } from '../../contracts/piContracts';
import { categoryMappingService } from '../../services/categoryMapping.service';
import { runPortfolioConfidence } from '../confidence/portfolioConfidence.engine';
import { runPortfolioBenchmark } from '../benchmark/portfolioBenchmark.engine';
import { runOpportunityDetection } from '../opportunity/opportunityDetection.engine';
import {
  runNarrativeIntelligence,
  DEFAULT_NARRATIVE_MOMENTUM,
} from '../narrative/narrativeIntelligence.engine';
import { explainabilityComposer } from '../../explainability/explainabilityComposer.service';
import type { GoalProfileId } from '../../services/goalProfile.service';

export function buildEngineContext(params: {
  userId: string;
  correlationId: string;
  ingestRevision: number;
  catalogVersion: number;
  positions: NormalizedPosition[];
  totalValueUsd: number;
}): Promise<PiEngineContext> {
  const eligible = params.positions.filter((p) => p.mappingConfidence >= 0.5);
  const excluded = params.positions.filter((p) => p.mappingConfidence < 0.5);
  const bundle = getActiveFormulaBundle();

  return Promise.all(
    eligible.map(async (pos) => {
      const internalCoinId = pos.internalCoinId ?? pos.symbol;
      const cats = pos.internalCoinId
        ? await categoryMappingService.getCategoriesForCoin(pos.internalCoinId)
        : { primaryCategoryId: null, secondaryCategoryIds: [], confidence: 0 };
      const nayftBucket = mapCategoryToNayftBucket(
        cats.primaryCategoryId,
        cats.primaryCategoryId,
        pos.symbol
      );
      return {
        internalCoinId,
        primaryCategoryId: cats.primaryCategoryId,
        confidence: cats.confidence,
        nayftBucket,
      };
    })
  ).then((positionMappings) => ({
    userId: params.userId,
    correlationId: params.correlationId,
    ingestRevision: params.ingestRevision,
    catalogVersion: params.catalogVersion,
    taxonomyVersion: bundle.taxonomy,
    positions: eligible,
    excludedPositions: excluded,
    totalValueUsd: params.totalValueUsd,
    formulaBundle: bundle,
    positionMappings,
  }));
}

export function runAnalyticsPipeline(
  ctx: PiEngineContext,
  options?: { goalProfileId?: GoalProfileId; multiWallet?: boolean }
): PortfolioAnalyticsPayloadV2 {
  const engineErrors: Array<{ engineId: string; code: string }> = [];
  let partial = false;
  let alloc;
  let pipelineState = initPipelineState({
    byCategory: {},
    byCategoryBps: {},
    topCategory: { id: 'Other', name: 'Other', pct: 0 },
    categoryCount: 0,
    unmappedCount: 0,
    explain: {
      eligibleCount: 0,
      excludedCount: ctx.excludedPositions.length,
      unmappedCount: 0,
      normalizationMethod: 'hamilton_largest_remainder',
    },
  });
  try {
    alloc = runCategoryAllocation(ctx);
    pipelineState = initPipelineState(alloc);
  } catch {
    engineErrors.push({ engineId: 'allocation', code: 'ALLOCATION_FAILED' });
    partial = true;
    alloc = {
      byCategory: {},
      byCategoryBps: {},
      topCategory: { id: 'Other', name: 'Other', pct: 0 },
      categoryCount: 0,
      unmappedCount: 0,
      explain: {
        eligibleCount: ctx.positions.length,
        excludedCount: ctx.excludedPositions.length,
        unmappedCount: 0,
        normalizationMethod: 'hamilton_largest_remainder',
      },
    };
    pipelineState = initPipelineState(alloc);
  }

  let risk = NEUTRAL_RISK;
  let narrative = NEUTRAL_NARRATIVE;
  if (pipelineState.allocationOk) {
    try {
      risk = runPortfolioRisk(pipelineState);
      narrative = runNarrativeExposure(pipelineState);
    } catch {
      partial = true;
      engineErrors.push({ engineId: 'risk_narrative', code: 'COMPUTE_FAILED' });
    }
  }

  let concentration = runConcentration(ctx.positions);
  let diversification = { score: 0, label: 'Poor', effectiveCategories: 0 };
  let stablecoin = { stablecoinPct: 0, bufferClass: 'Thin', pullbackReadiness: 'Low' };

  if (pipelineState.allocationOk) {
    try {
      diversification = runDiversification(pipelineState);
      stablecoin = runStablecoinBuffer(pipelineState, ctx.positions);
    } catch {
      partial = true;
      engineErrors.push({ engineId: 'structure', code: 'COMPUTE_FAILED' });
    }
  }

  let health = NEUTRAL_HEALTH;
  let identity = {
    primary: { id: 'unknown', name: 'Unknown', confidence: 0 },
    signals: {} as Record<string, number>,
    explain: { matchedRules: [] as Array<{ ruleId: string; priority: number; score: number; passed: boolean }> },
  };

  if (pipelineState.allocationOk && !partial) {
    health = runPortfolioHealth({
      riskTenths: risk.riskTenths,
      diversificationScore: diversification.score,
      topHoldingPct: concentration.topHoldingPct,
      stablecoinPct: stablecoin.stablecoinPct,
    });
    const narrativeBps: Record<string, number> = {};
    for (const [id, pct] of Object.entries(narrative.vector)) {
      narrativeBps[id] = Math.round(pct * 100);
    }
    identity = runPortfolioIdentity({
      state: pipelineState,
      riskTenths: risk.riskTenths,
      diversificationScore: diversification.score,
      concentrationLevel: concentration.concentrationLevel,
      narrativeBps,
    });
  } else if (pipelineState.allocationOk) {
    health = runPortfolioHealth({
      riskTenths: risk.riskTenths,
      diversificationScore: diversification.score,
      topHoldingPct: concentration.topHoldingPct,
      stablecoinPct: stablecoin.stablecoinPct,
    });
  }

  const replayPin: PiReplayPin = {
    ingestRevision: ctx.ingestRevision,
    catalogVersion: ctx.catalogVersion,
    taxonomyVersion: ctx.taxonomyVersion,
    formulaBundle: ctx.formulaBundle,
  };

  const allocSection = alloc ?? {
    byCategory: {},
    topCategory: { id: 'Other', name: 'Other', pct: 0 },
    categoryCount: 0,
    unmappedCount: 0,
    explain: {
      eligibleCount: ctx.positions.length,
      excludedCount: ctx.excludedPositions.length,
      unmappedCount: 0,
      normalizationMethod: 'hamilton_largest_remainder',
    },
  };

  const draft: PortfolioAnalyticsPayloadV2 = {
    schemaVersion: PI_ANALYTICS_SCHEMA_VERSION,
    computedAt: new Date().toISOString(),
    correlationId: ctx.correlationId,
    replayPin,
    taxonomyVersion: ctx.taxonomyVersion,
    formulaBundle: ctx.formulaBundle,
    partial,
    engineErrors: engineErrors.length ? engineErrors : undefined,
    allocation: {
      byCategory: allocSection.byCategory,
      topCategory: allocSection.topCategory,
      categoryCount: allocSection.categoryCount,
      catalogVersion: ctx.catalogVersion,
      explain: allocSection.explain,
    },
    risk: {
      riskScore: risk.riskScore,
      riskLabel: risk.riskLabel,
      contributions: risk.contributions,
      explain: risk.explain,
    },
    narrative,
    concentration,
    diversification,
    stablecoin,
    health: {
      healthScore: health.healthScore,
      healthLabel: health.healthLabel,
      breakdown: health.breakdown,
      explain: health.explain,
    },
    identity,
    insights: [],
    feedIntel: {
      narrativeVector: narrative.vector,
      convictionVector: Object.fromEntries(
        Object.entries(allocSection.byCategory).map(([k, v]) => [k, Math.min(1, v / 100)])
      ),
      topThemes: narrative.ranked.slice(0, 3).map((n) => n.name),
    },
    telemetry: {
      eligiblePositionCount: ctx.positions.length,
      excludedLowConfidenceCount: ctx.excludedPositions.length,
      mappingCoveragePct:
        ctx.positions.length > 0
          ? (ctx.positions.length - (allocSection.unmappedCount ?? 0)) / ctx.positions.length
          : 1,
    },
  };

  draft.insights = runInsightGeneration(
    draft,
    ctx.taxonomyVersion,
    pipelineState.allocationBps,
    risk.riskTenths
  );

  const mappingCoveragePct =
    ctx.positions.length > 0
      ? (ctx.positions.length - (allocSection.unmappedCount ?? 0)) / ctx.positions.length
      : 1;

  const confidence = runPortfolioConfidence({
    payload: draft,
    mappingCoveragePct,
  });

  const goalProfileId = options?.goalProfileId ?? 'balanced_growth';
  const benchmarks = runPortfolioBenchmark({
    payload: draft,
    totalValueUsd: ctx.totalValueUsd,
    goalProfileId,
    multiWallet: options?.multiWallet ?? false,
  });

  const narrativeIntel = runNarrativeIntelligence({
    payload: draft,
    marketSnapshot: DEFAULT_NARRATIVE_MOMENTUM,
  });

  const opportunities = runOpportunityDetection({
    payload: draft,
    goalProfileId,
    portfolioConfidence: confidence.portfolio,
    narrativeMomentum: narrativeIntel.momentum,
  });

  const explainability = explainabilityComposer.compose(draft, ctx);

  draft.confidence = confidence;
  draft.benchmarks = benchmarks;
  draft.opportunities = opportunities;
  draft.goalProfile = { id: goalProfileId, adapted: goalProfileId !== 'balanced_growth' };
  draft.narrativeIntel = narrativeIntel;
  draft.explainability = explainability;

  return draft;
}

export function buildAnalyticsFingerprint(
  userId: string,
  ingestRevision: number,
  catalogVersion: number,
  bundle = getActiveFormulaBundle()
): string {
  return createHash('sha256')
    .update(
      `${userId}:${ingestRevision}:${catalogVersion}:${formulaBundleFingerprint(bundle)}`
    )
    .digest('hex')
    .slice(0, 32);
}
