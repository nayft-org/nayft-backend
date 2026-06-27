import type { PortfolioAnalyticsPayloadV2, PiEngineContext } from '../contracts/piEngineContracts';

export type EngineExplanation = {
  engineId: string;
  formulaVersion: string;
  humanSummary: string;
  factors: Array<{
    label: string;
    value: string | number;
    impact: 'positive' | 'negative' | 'neutral';
    weight?: number;
  }>;
  provenance: {
    inputsUsed: string[];
    catalogVersion: number;
    taxonomyVersion: string;
    computedAt: string;
    correlationId: string;
  };
};

export type ExplainabilityBundle = Record<string, EngineExplanation>;

export const explainabilityComposer = {
  compose(
    payload: PortfolioAnalyticsPayloadV2,
    ctx: Pick<PiEngineContext, 'correlationId' | 'catalogVersion' | 'taxonomyVersion'>
  ): ExplainabilityBundle {
    const base = {
      catalogVersion: ctx.catalogVersion,
      taxonomyVersion: ctx.taxonomyVersion,
      computedAt: payload.computedAt,
      correlationId: ctx.correlationId,
    };

    const allocCats = Object.entries(payload.allocation.byCategory)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([k, v]) => `${k} ${(v as number).toFixed(1)}%`)
      .join(', ');

    return {
      allocation: {
        engineId: 'allocation',
        formulaVersion: payload.formulaBundle.allocation,
        humanSummary: allocCats
          ? `${allocCats} across ${payload.allocation.categoryCount} mapped categories.`
          : 'No mapped categories in portfolio.',
        factors: Object.entries(payload.allocation.byCategory).map(([label, value]) => ({
          label,
          value: value as number,
          impact: (value as number) > 30 ? ('negative' as const) : ('neutral' as const),
        })),
        provenance: { ...base, inputsUsed: ['positions', 'categoryMappings'] },
      },
      risk: {
        engineId: 'risk',
        formulaVersion: payload.formulaBundle.risk,
        humanSummary: `Risk score ${payload.risk.riskScore} (${payload.risk.riskLabel}) driven by category weights.`,
        factors: payload.risk.contributions.slice(0, 5).map((c) => ({
          label: c.categoryId,
          value: c.contribution,
          impact: c.contribution > 15 ? ('negative' as const) : ('neutral' as const),
          weight: c.weightPct,
        })),
        provenance: { ...base, inputsUsed: ['allocation.byCategory', 'categoryRiskWeights'] },
      },
      health: {
        engineId: 'health',
        formulaVersion: payload.formulaBundle.health,
        humanSummary: payload.health.healthScore != null
          ? `Health score ${payload.health.healthScore}: ${payload.health.healthLabel}.`
          : 'Health score unavailable due to incomplete analytics.',
        factors: Object.entries(payload.health.breakdown).map(([label, value]) => ({
          label,
          value: value as number,
          impact:
            (value as number) >= 70
              ? ('positive' as const)
              : (value as number) < 40
                ? ('negative' as const)
                : ('neutral' as const),
          weight: payload.health.explain.weights[label],
        })),
        provenance: { ...base, inputsUsed: ['risk', 'diversification', 'concentration', 'stablecoin'] },
      },
      identity: {
        engineId: 'identity',
        formulaVersion: payload.formulaBundle.identity,
        humanSummary: `Portfolio matches ${payload.identity.primary.name} (confidence ${(payload.identity.primary.confidence * 100).toFixed(0)}%).`,
        factors: payload.identity.explain.matchedRules.map((r) => ({
          label: r.ruleId,
          value: r.score,
          impact: r.passed ? ('positive' as const) : ('neutral' as const),
          weight: r.priority,
        })),
        provenance: { ...base, inputsUsed: ['allocation', 'narrative', 'risk', 'identityRules'] },
      },
      narrative: {
        engineId: 'narrative',
        formulaVersion: payload.formulaBundle.narrative,
        humanSummary: `Dominant narrative: ${payload.narrative.dominant.name} (${payload.narrative.dominant.pct.toFixed(1)}%).`,
        factors: payload.narrative.ranked.slice(0, 5).map((n) => ({
          label: n.name,
          value: n.pct,
          impact: 'neutral' as const,
        })),
        provenance: { ...base, inputsUsed: ['allocation.byCategory', 'narrativeMap'] },
      },
    };
  },
};
