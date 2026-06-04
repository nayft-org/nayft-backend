import { createHash } from 'crypto';
import { redis, cacheHelpers } from '../../../config/redis';
import { piConfig } from '../config/piConfig';
import { piRedisKeys, shadowPiRedisKeys } from '../cache/piRedisKeys';
import type { AnalyticsShellPayload, PiManifest } from '../contracts/piContracts';
import { piMetrics } from '../../../observability/piMetrics';

export const piPublishService = {
  async publishUserAnalytics(params: {
    userId: string;
    ingestRevision: number;
    catalogVersion: number;
    buildFingerprint: string;
    payload: AnalyticsShellPayload;
    shadow?: boolean;
  }): Promise<number> {
    const start = Date.now();
    const keys = params.shadow ? shadowPiRedisKeys() : piRedisKeys;

    const revision = await redis.incr(keys.userRevision(params.userId));

    const manifest: PiManifest = {
      revision,
      ingestRevision: params.ingestRevision,
      schemaVersion: piConfig.schemaVersion,
      buildFingerprint: params.buildFingerprint,
      computedAt: new Date().toISOString(),
      complete: true,
      catalogVersion: params.catalogVersion,
    };

    const stagingKey = keys.userAnalyticsStaging(params.userId);
    const activeKey = keys.userAnalytics(params.userId);

    await cacheHelpers.set(stagingKey, params.payload, piConfig.analyticsCacheTtlSec);
    await cacheHelpers.set(activeKey, params.payload, piConfig.analyticsCacheTtlSec);
    await redis.del(stagingKey).catch(() => {});
    await redis.set(keys.userManifest(params.userId), JSON.stringify(manifest));

    if (!params.shadow && piConfig.fanoutEnabled) {
      await redis.publish(
        piRedisKeys.fanoutChannel,
        JSON.stringify({
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

  etagFromPayload(payload: string): string {
    return createHash('sha256').update(payload).digest('hex').slice(0, 32);
  },
};
