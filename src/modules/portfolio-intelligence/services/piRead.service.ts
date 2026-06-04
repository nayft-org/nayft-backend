import { redis, cacheHelpers } from '../../../config/redis';
import { piRedisKeys } from '../cache/piRedisKeys';
import type { PortfolioContextDto, AnalyticsShellPayload, PiManifest } from '../contracts/piContracts';
import { PI_CONTEXT_SCHEMA_VERSION } from '../contracts/piContracts';
import { piRepository } from '../repository/piRepository';
import { PortfolioAnalyticsSnapshot } from '../models/PortfolioAnalyticsSnapshot';

const EMPTY_METRICS: AnalyticsShellPayload = { metrics: {}, insights: [] };

export const piReadService = {
  async getContext(userId: string): Promise<PortfolioContextDto> {
    const cached = await cacheHelpers.get<PortfolioContextDto>(piRedisKeys.feedContext(userId));
    if (cached) return cached;

    const [positions, revisionRaw, ingestRaw] = await Promise.all([
      piRepository.findPositionsByUser(userId),
      redis.get(piRedisKeys.userRevision(userId)),
      redis.get(piRedisKeys.ingestRevision(userId)),
    ]);

    const eligible = positions.filter((p) => p.mappingConfidence >= 0.5);
    const total = eligible.reduce((s, p) => s + p.valueUsd, 0);
    const weightBySymbol: Record<string, number> = {};
    const heldSymbols: string[] = [];
    const heldCoinIds: string[] = [];

    for (const p of eligible) {
      heldSymbols.push(p.symbol);
      if (p.internalCoinId) heldCoinIds.push(p.internalCoinId);
      weightBySymbol[p.symbol] = total > 0 ? p.valueUsd / total : 0;
    }

    const manifestRaw = await redis.get(piRedisKeys.userManifest(userId));
    let stale = false;
    if (manifestRaw) {
      try {
        const m = JSON.parse(manifestRaw) as PiManifest;
        stale = !m.complete;
      } catch {
        stale = true;
      }
    }

    const dto: PortfolioContextDto = {
      schemaVersion: PI_CONTEXT_SCHEMA_VERSION,
      userId,
      heldSymbols,
      heldCoinIds,
      weightBySymbol,
      ingestRevision: parseInt(ingestRaw || '0', 10) || 0,
      analyticsRevision: parseInt(revisionRaw || '0', 10) || 0,
      stale,
      staleMapping: positions.some((p) => p.mappingConfidence < 0.5),
    };

    await cacheHelpers.set(piRedisKeys.feedContext(userId), dto, 30);
    return dto;
  },

  async getLatestAnalytics(userId: string): Promise<{
    manifest: PiManifest | null;
    payload: AnalyticsShellPayload;
  }> {
    const manifestRaw = await redis.get(piRedisKeys.userManifest(userId));
    const payload =
      (await cacheHelpers.get<AnalyticsShellPayload>(piRedisKeys.userAnalytics(userId))) ??
      EMPTY_METRICS;

    if (manifestRaw) {
      return { manifest: JSON.parse(manifestRaw) as PiManifest, payload };
    }

    const doc = await PortfolioAnalyticsSnapshot.findOne({ userId })
      .sort({ revision: -1 })
      .lean();
    if (!doc) return { manifest: null, payload: EMPTY_METRICS };

    return {
      manifest: {
        revision: doc.revision,
        ingestRevision: doc.inputsRevision,
        schemaVersion: doc.schemaVersion,
        buildFingerprint: doc.buildFingerprint,
        computedAt: doc.computedAt.toISOString(),
        complete: true,
        catalogVersion: doc.catalogVersion,
      },
      payload: doc.payload as AnalyticsShellPayload,
    };
  },

  async invalidateFeedContext(userId: string): Promise<void> {
    await redis.del(piRedisKeys.feedContext(userId));
  },
};
