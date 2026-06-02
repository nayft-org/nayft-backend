import { cacheHelpers } from '../../../config/redis';
import { coinRiskKey, riskRedisKeys } from '../cache/riskRedisKeys';
import {
  getActiveManifest,
  getRiskSnapshot,
  type CoinRiskDto,
  type RiskManifest,
  type RiskSnapshotPayload,
} from '../publish/riskSnapshotPublisher';
import { RiskSnapshot } from '../models/RiskSnapshot';
import { RiskScoreHistory } from '../models/RiskScoreHistory';

const STALE_MS = 20 * 60 * 1000;

function metaFromPayload(payload: RiskSnapshotPayload | null, manifest: RiskManifest | null) {
  const computedAt = payload?.computedAt || manifest?.computedAt || null;
  const stale = computedAt ? Date.now() - Date.parse(computedAt) > STALE_MS : true;
  return {
    revision: payload?.revision ?? manifest?.revision ?? 0,
    buildId: payload?.buildId ?? manifest?.buildId ?? '',
    buildFingerprint: payload?.buildFingerprint ?? manifest?.buildFingerprint ?? '',
    computedAt,
    stale,
    partial: payload?.partial ?? false,
    versions: manifest?.versions,
  };
}

export const riskReadService = {
  getSnapshot: async (): Promise<{
    meta: ReturnType<typeof metaFromPayload>;
    data: RiskSnapshotPayload | null;
    manifest: RiskManifest | null;
  }> => {
    const [data, manifest] = await Promise.all([getRiskSnapshot(), getActiveManifest()]);
    if (!manifest?.complete) {
      return { meta: metaFromPayload(null, manifest), data: null, manifest };
    }
    return { meta: metaFromPayload(data, manifest), data, manifest };
  },

  getCoin: async (symbol: string): Promise<{
    meta: ReturnType<typeof metaFromPayload>;
    data: CoinRiskDto | null;
  }> => {
    const upper = symbol.toUpperCase();
    let cached = await cacheHelpers.get<CoinRiskDto>(coinRiskKey(upper));
    if (!cached) {
      const doc = await RiskSnapshot.findOne({ symbol: upper }).lean();
      if (doc) {
        cached = {
          symbol: doc.symbol,
          internalCoinId: doc.internalCoinId,
          crs: doc.crs,
          rank: doc.rank,
          percentile: doc.percentile,
          confidence: doc.confidence,
          regime: doc.regime,
          factors: doc.factors as CoinRiskDto['factors'],
        };
      }
    }
    const manifest = await getActiveManifest();
    return {
      meta: metaFromPayload(null, manifest),
      data: cached,
    };
  },

  getTopRisk: async (limit = 50): Promise<{ meta: ReturnType<typeof metaFromPayload>; coins: CoinRiskDto[] }> => {
    const snap = await getRiskSnapshot();
    const manifest = await getActiveManifest();
    const coins = snap ? [...snap.coins].sort((a, b) => b.crs - a.crs).slice(0, limit) : [];
    return { meta: metaFromPayload(snap, manifest), coins };
  },

  getMovers: async (): Promise<{ meta: ReturnType<typeof metaFromPayload>; data: unknown }> => {
    const movers = await cacheHelpers.get(riskRedisKeys.topMovers);
    const manifest = await getActiveManifest();
    return { meta: metaFromPayload(null, manifest), data: movers ?? { topRisk: [], bottomRisk: [] } };
  },

  getRegime: async (): Promise<{ meta: ReturnType<typeof metaFromPayload>; data: unknown }> => {
    const regime = await cacheHelpers.get(riskRedisKeys.regime);
    const manifest = await getActiveManifest();
    return { meta: metaFromPayload(null, manifest), data: regime };
  },

  getHistory: async (
    symbol: string,
    from?: Date,
    to?: Date,
    limit = 200
  ): Promise<{ points: Array<{ computedAt: Date; crs: number; rank: number; regime: string }> }> => {
    const q: Record<string, unknown> = { symbol: symbol.toUpperCase() };
    if (from || to) {
      q.computedAt = {};
      if (from) (q.computedAt as Record<string, Date>).$gte = from;
      if (to) (q.computedAt as Record<string, Date>).$lte = to;
    }
    const points = await RiskScoreHistory.find(q)
      .sort({ computedAt: -1 })
      .limit(limit)
      .lean();
    return {
      points: points.map((p) => ({
        computedAt: p.computedAt,
        crs: p.crs,
        rank: p.rank,
        regime: p.regime,
      })),
    };
  },
};
