import { redis, cacheHelpers } from '../../../config/redis';
import { featureService } from '../../../core/feature-system/feature.service';
import { piConfig } from '../config/piConfig';
import { piRedisKeys, shadowPiRedisKeys } from '../cache/piRedisKeys';
import type { PiManifest } from '../contracts/piContracts';
import type { PortfolioAnalyticsPayloadV2 } from '../contracts/piEngineContracts';
import { canonicalJson, etagFromCanonical } from '../engines/math/canonicalJson';
import { piMetrics } from '../../../observability/piMetrics';

export type PublishAnalyticsParams = {
  userId: string;
  ingestRevision: number;
  catalogVersion: number;
  buildFingerprint: string;
  payload: PortfolioAnalyticsPayloadV2 | Record<string, unknown>;
  shadow?: boolean;
  complete?: boolean;
  partial?: boolean;
  formulaBundle?: Record<string, string>;
};

export const piPublishService = {
  async publishUserAnalytics(params: PublishAnalyticsParams): Promise<number> {
    const start = Date.now();
    const keys = params.shadow ? shadowPiRedisKeys() : piRedisKeys;
    const complete = params.complete !== false;
    const partial = params.partial === true;

    const stagingKey = keys.userAnalyticsStaging(params.userId);
    const activeKey = keys.userAnalytics(params.userId);
    const manifestStagingKey = `${keys.userManifest(params.userId)}:staging`;

    await cacheHelpers.set(stagingKey, params.payload, piConfig.analyticsCacheTtlSec);

    const manifestDraft: PiManifest = {
      revision: 0,
      ingestRevision: params.ingestRevision,
      schemaVersion: piConfig.schemaVersion,
      buildFingerprint: params.buildFingerprint,
      computedAt: new Date().toISOString(),
      complete,
      catalogVersion: params.catalogVersion,
      partial: partial || !complete,
      formulaBundle: params.formulaBundle,
      etag: etagFromCanonical(params.payload),
    };

    await redis.set(manifestStagingKey, JSON.stringify(manifestDraft));

    const revision = await redis.incr(keys.userRevision(params.userId));
    manifestDraft.revision = revision;

    const stagingPayload = await redis.get(stagingKey);
    if (stagingPayload) {
      await cacheHelpers.set(activeKey, JSON.parse(stagingPayload), piConfig.analyticsCacheTtlSec);
    } else {
      await cacheHelpers.set(activeKey, params.payload, piConfig.analyticsCacheTtlSec);
    }

    await redis.set(keys.userManifest(params.userId), JSON.stringify(manifestDraft));
    await redis.del(stagingKey).catch(() => {});
    await redis.del(manifestStagingKey).catch(() => {});

    const realtimeFlag = await featureService.isActive('portfolio_intelligence_realtime');
    if (!params.shadow && piConfig.fanoutEnabled && realtimeFlag && complete && !partial) {
      await redis.publish(
        piRedisKeys.fanoutChannel,
        canonicalJson({
          envelopeVersion: 1,
          type: 'analytics_revision',
          userId: params.userId,
          seq: await redis.incr(keys.wsSeq(params.userId)),
          revision,
          correlationId: params.buildFingerprint,
          emittedAt: new Date().toISOString(),
        })
      );
      piMetrics.fanoutMessage();
    }

    piMetrics.publishDurationMs(Date.now() - start);
    return revision;
  },

  etagFromPayload(payload: unknown): string {
    return etagFromCanonical(payload);
  },
};
