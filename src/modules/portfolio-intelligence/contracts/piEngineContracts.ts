import type { NormalizedPosition } from './piContracts';
import type { PiFormulaBundle } from '../config/piFormulaRegistry';

export const PI_ANALYTICS_SCHEMA_VERSION = 2;

export type PiReplayPin = {
  ingestRevision: number;
  catalogVersion: number;
  taxonomyVersion: string;
  formulaBundle: PiFormulaBundle;
  positionSnapshotId?: string;
};

export type PositionCategoryMapping = {
  internalCoinId: string;
  primaryCategoryId: string | null;
  primaryCategoryName?: string;
  confidence: number;
  nayftBucket: string;
};

export type PiEngineContext = {
  userId: string;
  correlationId: string;
  ingestRevision: number;
  catalogVersion: number;
  taxonomyVersion: string;
  positions: NormalizedPosition[];
  excludedPositions: NormalizedPosition[];
  totalValueUsd: number;
  formulaBundle: PiFormulaBundle;
  positionMappings: PositionCategoryMapping[];
  replayMode?: boolean;
};

export type PortfolioAnalyticsPayloadV2 = {
  schemaVersion: typeof PI_ANALYTICS_SCHEMA_VERSION;
  computedAt: string;
  correlationId: string;
  replayPin: PiReplayPin;
  taxonomyVersion: string;
  formulaBundle: PiFormulaBundle;
  partial: boolean;
  engineErrors?: Array<{ engineId: string; code: string }>;

  allocation: {
    byCategory: Record<string, number>;
    topCategory: { id: string; name: string; pct: number };
    categoryCount: number;
    catalogVersion: number;
    explain: {
      eligibleCount: number;
      excludedCount: number;
      unmappedCount: number;
      normalizationMethod: string;
    };
  };

  risk: {
    riskScore: number;
    riskLabel: string;
    contributions: Array<{
      categoryId: string;
      weightPct: number;
      riskWeight: number;
      contribution: number;
    }>;
    explain: { formula: string };
  };

  narrative: {
    vector: Record<string, number>;
    dominant: { id: string; name: string; pct: number };
    ranked: Array<{ id: string; name: string; pct: number }>;
  };

  concentration: {
    topHolding: string;
    topHoldingPct: number;
    top3Pct: number;
    concentrationLevel: string;
    hhi: number;
  };

  diversification: {
    score: number;
    label: string;
    effectiveCategories: number;
  };

  stablecoin: {
    stablecoinPct: number;
    bufferClass: string;
    pullbackReadiness: string;
  };

  health: {
    healthScore: number | null;
    healthLabel: string;
    breakdown: {
      risk: number;
      diversification: number;
      concentration: number;
      stablecoin: number;
    };
    explain: {
      weights: Record<string, number>;
      subScores: Record<string, number>;
    };
  };

  identity: {
    primary: { id: string; name: string; confidence: number };
    secondary?: { id: string; name: string; confidence: number };
    signals: Record<string, number>;
    explain: { matchedRules: Array<{ ruleId: string; priority: number; score: number; passed: boolean }> };
  };

  insights: Array<{
    id: string;
    templateId: string;
    type: string;
    severity: string;
    priority: number;
    title: string;
    summary: string;
    evidence: Record<string, unknown>;
    confidence: number;
    modelVersion: string;
  }>;

  feedIntel: {
    narrativeVector: Record<string, number>;
    convictionVector: Record<string, number>;
    topThemes: string[];
  };

  telemetry: {
    eligiblePositionCount: number;
    excludedLowConfidenceCount: number;
    mappingCoveragePct: number;
  };

  /** v3 optional extensions — ignored by v2 clients */
  confidence?: {
    portfolio: number;
    analytics: number;
    identity: number;
    risk: number;
    propagated: {
      insightSeverityCap?: string;
      healthSuppressed?: boolean;
      riskLabelSuffix?: string;
    };
  };
  explainability?: Record<string, unknown>;
  benchmarks?: {
    cohortId: string;
    cohortSize: number;
    healthPercentile: number;
    riskPercentile: number;
    diversificationPercentile: number;
    categoryPercentiles: Record<string, number>;
  };
  opportunities?: Array<{
    id: string;
    type: string;
    priority: number;
    title: string;
    summary: string;
    evidence: Record<string, unknown>;
    confidence: number;
    goalAdapted: boolean;
    disclaimer?: boolean;
  }>;
  goalProfile?: { id: string; adapted: boolean };
  narrativeIntel?: {
    exposure: Record<string, number>;
    conviction: Record<string, number>;
    momentum: Record<string, number>;
    topConvictionGaps: Array<{ narrativeId: string; gap: number }>;
  };
};

export type PipelineState = {
  allocationBps: Record<string, number>;
  allocationOk: boolean;
};
