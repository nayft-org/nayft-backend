import { eventService } from '../../../core/event-system';
import type { PortfolioAnalyticsPayloadV2 } from '../contracts/piEngineContracts';

export type DomainEventPayload =
  | {
      type: 'portfolio_intelligence:identity_changed';
      from: { id: string; name: string; confidence: number };
      to: { id: string; name: string; confidence: number };
    }
  | {
      type: 'portfolio_intelligence:risk_band_changed';
      from: { riskScore: number; riskLabel: string };
      to: { riskScore: number; riskLabel: string };
      bandDelta: 'up' | 'down' | 'unchanged';
    }
  | {
      type: 'portfolio_intelligence:health_score_changed';
      from: number | null;
      to: number | null;
      delta: number;
    }
  | {
      type: 'portfolio_intelligence:narrative_shift_detected';
      narrativeId: string;
      fromPct: number;
      toPct: number;
      shiftMagnitude: number;
    }
  | {
      type: 'portfolio_intelligence:benchmark_percentile_changed';
      metric: string;
      fromPercentile: number;
      toPercentile: number;
      cohortId: string;
    };

export const piDomainEventEmitter = {
  detectEvents(
    previous: PortfolioAnalyticsPayloadV2 | null,
    current: PortfolioAnalyticsPayloadV2
  ): DomainEventPayload[] {
    if (!previous) return [];
    const events: DomainEventPayload[] = [];

    const prevId = previous.identity?.primary;
    const currId = current.identity?.primary;
    if (
      prevId &&
      currId &&
      (prevId.id !== currId.id || Math.abs(prevId.confidence - currId.confidence) >= 0.15)
    ) {
      events.push({
        type: 'portfolio_intelligence:identity_changed',
        from: prevId,
        to: currId,
      });
    }

    const prevRisk = previous.risk;
    const currRisk = current.risk;
    if (
      prevRisk.riskLabel !== currRisk.riskLabel ||
      Math.abs(prevRisk.riskScore - currRisk.riskScore) >= 1
    ) {
      events.push({
        type: 'portfolio_intelligence:risk_band_changed',
        from: { riskScore: prevRisk.riskScore, riskLabel: prevRisk.riskLabel },
        to: { riskScore: currRisk.riskScore, riskLabel: currRisk.riskLabel },
        bandDelta:
          currRisk.riskScore > prevRisk.riskScore
            ? 'up'
            : currRisk.riskScore < prevRisk.riskScore
              ? 'down'
              : 'unchanged',
      });
    }

    const prevHealth = previous.health?.healthScore ?? null;
    const currHealth = current.health?.healthScore ?? null;
    if (prevHealth != null && currHealth != null && Math.abs(currHealth - prevHealth) >= 5) {
      events.push({
        type: 'portfolio_intelligence:health_score_changed',
        from: prevHealth,
        to: currHealth,
        delta: currHealth - prevHealth,
      });
    }

    for (const narrativeId of new Set([
      ...Object.keys(previous.narrative?.vector ?? {}),
      ...Object.keys(current.narrative?.vector ?? {}),
    ])) {
      const fromPct = previous.narrative?.vector?.[narrativeId] ?? 0;
      const toPct = current.narrative?.vector?.[narrativeId] ?? 0;
      if (Math.abs(toPct - fromPct) >= 10) {
        events.push({
          type: 'portfolio_intelligence:narrative_shift_detected',
          narrativeId,
          fromPct,
          toPct,
          shiftMagnitude: toPct - fromPct,
        });
      }
    }

    const prevBench = previous.benchmarks?.healthPercentile;
    const currBench = current.benchmarks?.healthPercentile;
    if (prevBench != null && currBench != null) {
      const prevDecile = Math.floor(prevBench / 10);
      const currDecile = Math.floor(currBench / 10);
      if (prevDecile !== currDecile) {
        events.push({
          type: 'portfolio_intelligence:benchmark_percentile_changed',
          metric: 'healthScore',
          fromPercentile: prevBench,
          toPercentile: currBench,
          cohortId: current.benchmarks?.cohortId ?? '',
        });
      }
    }

    return events;
  },

  async emitDomainEvents(params: {
    userId: string;
    correlationId: string;
    analyticsRevision: number;
    events: DomainEventPayload[];
  }): Promise<void> {
    for (const evt of params.events) {
      await eventService.emitEvent({
        featureKey: 'portfolio_intelligence_foundation',
        eventType: evt.type,
        userId: params.userId,
        metadata: {
          correlationId: params.correlationId,
          analyticsRevision: params.analyticsRevision,
          ...evt,
        },
      });
    }
  },
};
