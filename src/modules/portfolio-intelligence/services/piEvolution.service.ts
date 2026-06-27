import { cacheHelpers } from '../../../config/redis';
import { PortfolioSnapshot } from '../models/PortfolioSnapshot';
import { PortfolioAnalyticsSnapshot } from '../models/PortfolioAnalyticsSnapshot';

export type EvolutionPoint = {
  asOf: string;
  totalValueUsd: number;
  allocationByCategory: Record<string, number>;
  healthScore?: number | null;
};

export type HistoryPoint = {
  asOf: string;
  value: number | string;
  metadata?: Record<string, unknown>;
};

export type HistoryTimeline = {
  dimension: string;
  points: HistoryPoint[];
  changeEvents: Array<{ asOf: string; event: string; from: unknown; to: unknown }>;
};

const EVO_CACHE_TTL = 300;

export const piEvolutionService = {
  async getEvolution(userId: string, days: 30 | 90 = 30): Promise<{
    points: EvolutionPoint[];
    granularity: 'daily' | 'delta';
  }> {
    const cacheKey = `pi:evolution:${userId}:${days}`;
    const cached = await cacheHelpers.get<{ points: EvolutionPoint[]; granularity: 'daily' | 'delta' }>(cacheKey);
    if (cached) return cached;

    const since = new Date(Date.now() - days * 86400_000);
    const snapshots = await PortfolioSnapshot.find({ userId, asOf: { $gte: since } })
      .sort({ asOf: 1 })
      .lean();

    const analytics = await PortfolioAnalyticsSnapshot.find({
      userId,
      computedAt: { $gte: since },
    })
      .sort({ computedAt: 1 })
      .lean();

    const healthByDate = new Map<string, number | null>();
    for (const a of analytics) {
      const payload = a.payload as { health?: { healthScore?: number | null }; allocation?: { byCategory?: Record<string, number> } };
      healthByDate.set(a.computedAt.toISOString(), payload.health?.healthScore ?? null);
    }

    const points: EvolutionPoint[] = snapshots.map((s) => {
      const ext = s as typeof s & {
        allocationByCategory?: Record<string, number>;
        healthScore?: number | null;
      };
      return {
        asOf: s.asOf.toISOString(),
        totalValueUsd: s.totalValueUsd,
        allocationByCategory: ext.allocationByCategory ?? {},
        healthScore: ext.healthScore ?? healthByDate.get(s.asOf.toISOString()) ?? null,
      };
    });

    const result = {
      points,
      granularity: (days >= 90 ? 'daily' : 'delta') as 'daily' | 'delta',
    };
    await cacheHelpers.set(cacheKey, result, EVO_CACHE_TTL);
    return result;
  },

  async getHistoricalTimeline(
    userId: string,
    dimension: string,
    days: 30 | 90 = 30
  ): Promise<HistoryTimeline> {
    const since = new Date(Date.now() - days * 86400_000);
    const snapshots = await PortfolioSnapshot.find({ userId, asOf: { $gte: since } })
      .sort({ asOf: 1 })
      .lean();

    const points: HistoryPoint[] = [];
    const changeEvents: HistoryTimeline['changeEvents'] = [];
    let prev: unknown;

    for (const s of snapshots) {
      const ext = s as typeof s & {
        healthScore?: number | null;
        riskScore?: number;
        riskLabel?: string;
        identityPrimaryId?: string;
        identityConfidence?: number;
        narrativeVector?: Record<string, number>;
        allocationByCategory?: Record<string, number>;
      };

      let value: number | string;
      const metadata: Record<string, unknown> = {};

      switch (dimension) {
        case 'health':
          value = ext.healthScore ?? 0;
          break;
        case 'risk':
          value = ext.riskScore ?? 0;
          metadata.riskLabel = ext.riskLabel;
          break;
        case 'identity':
          value = ext.identityPrimaryId ?? 'unknown';
          metadata.confidence = ext.identityConfidence;
          break;
        case 'narrative':
          value = Object.keys(ext.narrativeVector ?? {})[0] ?? 'none';
          metadata.vector = ext.narrativeVector;
          break;
        case 'allocation':
          value = ext.allocationByCategory?.[Object.keys(ext.allocationByCategory ?? {})[0] ?? ''] ?? 0;
          metadata.byCategory = ext.allocationByCategory;
          break;
        default:
          value = s.totalValueUsd;
      }

      points.push({ asOf: s.asOf.toISOString(), value, metadata });

      if (prev !== undefined && prev !== value) {
        changeEvents.push({
          asOf: s.asOf.toISOString(),
          event: `${dimension}_changed`,
          from: prev,
          to: value,
        });
      }
      prev = value;
    }

    return { dimension, points, changeEvents };
  },
};
