import { redis, cacheHelpers } from '../../../config/redis';
import { piRedisKeys } from '../cache/piRedisKeys';
import type { PortfolioContextDto, AnalyticsShellPayload, PiManifest } from '../contracts/piContracts';
import { PI_CONTEXT_SCHEMA_VERSION } from '../contracts/piContracts';
import type { PortfolioAnalyticsPayloadV2 } from '../contracts/piEngineContracts';
import { piRepository } from '../repository/piRepository';
import { PortfolioAnalyticsSnapshot } from '../models/PortfolioAnalyticsSnapshot';
import { piConfig } from '../config/piConfig';
import { getRuntimeSwitches } from '../../../core/runtime-config/runtimeConfig.service';
import { userRepository } from '../../user/repository';

const EMPTY_METRICS: AnalyticsShellPayload = { metrics: {}, insights: [] };

export type FeedContextV2 = PortfolioContextDto & {
  narrativeVector?: Record<string, number>;
  convictionVector?: Record<string, number>;
  topThemes?: string[];
  healthScore?: number | null;
  identityId?: string;
  partial?: boolean;
  formulaBundle?: Record<string, string>;
};

export const piReadService = {
  async getAnalyticsPayload(userId: string): Promise<PortfolioAnalyticsPayloadV2 | null> {
    const cached = await cacheHelpers.get<PortfolioAnalyticsPayloadV2>(piRedisKeys.userAnalytics(userId));
    if (cached && cached.schemaVersion === 2) return cached;

    const doc = await PortfolioAnalyticsSnapshot.findOne({ userId, schemaVersion: 2 })
      .sort({ revision: -1 })
      .lean();
    if (!doc?.payload) return null;
    return doc.payload as unknown as PortfolioAnalyticsPayloadV2;
  },

  async getContext(userId: string): Promise<PortfolioContextDto> {
    const switches = await getRuntimeSwitches();
    if (switches.personalization_globally_disabled) {
      return {
        schemaVersion: PI_CONTEXT_SCHEMA_VERSION,
        userId,
        heldSymbols: [],
        heldCoinIds: [],
        weightBySymbol: {},
        ingestRevision: 0,
        analyticsRevision: 0,
        stale: false,
        staleMapping: false,
      };
    }
    const userEnabled = await userRepository.getPersonalizationEnabled(userId);
    if (!userEnabled) {
      return {
        schemaVersion: PI_CONTEXT_SCHEMA_VERSION,
        userId,
        heldSymbols: [],
        heldCoinIds: [],
        weightBySymbol: {},
        ingestRevision: 0,
        analyticsRevision: 0,
        stale: false,
        staleMapping: false,
      };
    }

    const v2Key = `feed:context:${userId}:v2`;
    const cachedV2 = await cacheHelpers.get<FeedContextV2>(v2Key);
    if (cachedV2) return cachedV2;

    const cached = await cacheHelpers.get<PortfolioContextDto>(piRedisKeys.feedContext(userId));
    if (cached) return cached;

    const analytics = await this.getAnalyticsPayload(userId);

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
    let partial = analytics?.partial ?? false;
    if (manifestRaw) {
      try {
        const m = JSON.parse(manifestRaw) as PiManifest;
        stale = !m.complete || m.partial === true;
        partial = m.partial === true;
      } catch {
        stale = true;
      }
    }

    const dto: FeedContextV2 = {
      schemaVersion: PI_CONTEXT_SCHEMA_VERSION,
      userId,
      heldSymbols,
      heldCoinIds,
      weightBySymbol,
      ingestRevision: parseInt(ingestRaw || '0', 10) || 0,
      analyticsRevision: parseInt(revisionRaw || '0', 10) || 0,
      stale,
      staleMapping: positions.some((p) => p.mappingConfidence < 0.5),
      narrativeVector: analytics?.feedIntel?.narrativeVector,
      convictionVector: analytics?.feedIntel?.convictionVector,
      topThemes: analytics?.feedIntel?.topThemes,
      healthScore: analytics?.health?.healthScore ?? null,
      identityId: analytics?.identity?.primary?.id,
      partial,
      formulaBundle: analytics?.formulaBundle as unknown as Record<string, string>,
    };

    await cacheHelpers.set(piRedisKeys.feedContext(userId), dto, piConfig.feedContextCacheTtlSec);
    return dto;
  },

  async buildFeedContextV2(
    userId: string,
    payload: PortfolioAnalyticsPayloadV2,
    analyticsRevision: number
  ): Promise<void> {
    const positions = await piRepository.findPositionsByUser(userId);
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

    const dto: FeedContextV2 = {
      schemaVersion: PI_CONTEXT_SCHEMA_VERSION,
      userId,
      heldSymbols,
      heldCoinIds,
      weightBySymbol,
      ingestRevision: payload.replayPin.ingestRevision,
      analyticsRevision,
      stale: false,
      staleMapping: payload.telemetry.excludedLowConfidenceCount > 0,
      narrativeVector: payload.feedIntel.narrativeVector,
      convictionVector: payload.feedIntel.convictionVector,
      topThemes: payload.feedIntel.topThemes,
      healthScore: payload.health.healthScore,
      identityId: payload.identity.primary.id,
      partial: payload.partial,
      formulaBundle: payload.formulaBundle as unknown as Record<string, string>,
    };

    await cacheHelpers.set(`feed:context:${userId}:v2`, dto, piConfig.feedContextCacheTtlSec);
    await cacheHelpers.set(piRedisKeys.feedContext(userId), dto, piConfig.feedContextCacheTtlSec);
  },

  async getSummary(userId: string) {
    const payload = await this.getAnalyticsPayload(userId);
    if (!payload) return null;
    return {
      healthScore: payload.health.healthScore,
      healthLabel: payload.health.healthLabel,
      riskScore: payload.risk.riskScore,
      riskLabel: payload.risk.riskLabel,
      identity: payload.identity.primary,
      topCategory: payload.allocation.topCategory,
      partial: payload.partial,
      analyticsRevision: parseInt((await redis.get(piRedisKeys.userRevision(userId))) || '0', 10),
      formulaBundle: payload.formulaBundle,
    };
  },

  async getInsights(userId: string) {
    const payload = await this.getAnalyticsPayload(userId);
    if (!payload) return { insights: [] as PortfolioAnalyticsPayloadV2['insights'] };
    return { insights: payload.insights, partial: payload.partial };
  },

  async getLatestAnalytics(userId: string): Promise<{
    manifest: PiManifest | null;
    payload: AnalyticsShellPayload | PortfolioAnalyticsPayloadV2;
  }> {
    const manifestRaw = await redis.get(piRedisKeys.userManifest(userId));
    const v2 = await cacheHelpers.get<PortfolioAnalyticsPayloadV2>(piRedisKeys.userAnalytics(userId));
    if (v2) {
      return {
        manifest: manifestRaw ? (JSON.parse(manifestRaw) as PiManifest) : null,
        payload: v2,
      };
    }

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
      payload: doc.payload as AnalyticsShellPayload | PortfolioAnalyticsPayloadV2,
    };
  },

  async invalidateFeedContext(userId: string): Promise<void> {
    await redis.del(piRedisKeys.feedContext(userId));
    await redis.del(`feed:context:${userId}:v2`);
  },
};
