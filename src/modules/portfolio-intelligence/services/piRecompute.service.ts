import { piConfig } from '../config/piConfig';
import { PiRecomputeJob } from '../contracts/piContracts';
import { positionNormalizerService } from './positionNormalizer.service';
import { snapshotWriterService } from './snapshotWriter.service';
import { piPublishService } from './piPublish.service';
import { shadowDriftService } from './shadowDrift.service';
import { categoryMappingService } from './categoryMapping.service';
import { piReadService } from './piRead.service';
import { piRepository } from '../repository/piRepository';
import { recomputeEnqueueService } from './recomputeEnqueue.service';
import { PiRecomputeJob as PiRecomputeJobModel } from '../models/PiRecomputeJob';
import { piMetrics } from '../../../observability/piMetrics';
import { eventService } from '../../../core/event-system';
import {
  buildEngineContext,
  runAnalyticsPipeline,
  buildAnalyticsFingerprint,
} from '../engines/composition/piAnalyticsPipeline';
import type { PortfolioAnalyticsPayloadV2 } from '../contracts/piEngineContracts';
import { redis } from '../../../config/redis';
import { piRedisKeys } from '../cache/piRedisKeys';
import { getActiveFormulaBundle } from '../config/piFormulaRegistry';

export const piRecomputeService = {
  async processJob(job: PiRecomputeJob): Promise<void> {
    const start = Date.now();
    const { userId, trigger, correlationId } = job;

    await eventService.emitEvent({
      featureKey: 'portfolio_intelligence_foundation',
      eventType: 'portfolio_intelligence.recompute_started',
      userId,
      metadata: { correlationId, trigger },
    });

    const catalogVersion = await categoryMappingService.getCatalogVersion();
    const bundle = getActiveFormulaBundle();

    const jobId = recomputeEnqueueService.jobIdFor(
      userId,
      job.ingestRevision ?? 0,
      catalogVersion
    );

    await PiRecomputeJobModel.findOneAndUpdate(
      { jobId },
      {
        $setOnInsert: { jobId, userId, trigger, correlationId, status: 'processing' },
        $set: { startedAt: new Date(), status: 'processing' },
        $inc: { attempts: 1 },
      },
      { upsert: true }
    );

    try {
      const normalized = await positionNormalizerService.normalizeForUser(userId, correlationId);
      const fingerprint = buildAnalyticsFingerprint(
        userId,
        normalized.ingestRevision,
        catalogVersion,
        bundle
      );

      const manifestRaw = await redis.get(piRedisKeys.userManifest(userId));
      if (manifestRaw) {
        try {
          const m = JSON.parse(manifestRaw) as { buildFingerprint?: string };
          if (m.buildFingerprint === fingerprint) {
            piMetrics.recomputeCompleted(trigger, Date.now() - start);
            await PiRecomputeJobModel.updateOne(
              { jobId },
              { $set: { status: 'completed', finishedAt: new Date() } }
            );
            return;
          }
        } catch {
          /* continue recompute */
        }
      }

      const ctx = await buildEngineContext({
        userId,
        correlationId,
        ingestRevision: normalized.ingestRevision,
        catalogVersion,
        positions: normalized.positions,
        totalValueUsd: normalized.totalValueUsd,
      });

      const engineStart = Date.now();
      const payload: PortfolioAnalyticsPayloadV2 = runAnalyticsPipeline(ctx);
      piMetrics.engineLatencyMs('pipeline', Date.now() - engineStart);
      piMetrics.insightsGenerated(payload.insights.length);

      const previous = await piRepository.findPositionsByUser(userId);
      const prevTotal = previous.reduce((s, p) => s + p.valueUsd, 0);

      const shadow = piConfig.shadowMode && !piConfig.enabled;
      const tier1Ok = !payload.engineErrors?.some((e) => e.engineId === 'allocation');
      const complete = tier1Ok && ctx.positions.length >= 0;
      const partial = payload.partial || !tier1Ok;

      const analyticsRevision = await piPublishService.publishUserAnalytics({
        userId,
        ingestRevision: normalized.ingestRevision,
        catalogVersion,
        buildFingerprint: fingerprint,
        payload,
        shadow,
        complete,
        partial,
        formulaBundle: bundle as unknown as Record<string, string>,
      });

      await snapshotWriterService.writeDeltaIfNeeded(
        userId,
        normalized.ingestRevision,
        analyticsRevision,
        normalized.positions,
        normalized.totalValueUsd,
        prevTotal
      );

      await piRepository.saveAnalyticsSnapshot({
        userId,
        revision: analyticsRevision,
        inputsRevision: normalized.ingestRevision,
        catalogVersion,
        buildFingerprint: fingerprint,
        payload,
      });

      if (complete && !partial) {
        await piReadService.invalidateFeedContext(userId);
        await piReadService.buildFeedContextV2(userId, payload, analyticsRevision);
      }

      await shadowDriftService.compareUser(userId);

      await PiRecomputeJobModel.updateOne(
        { jobId },
        { $set: { status: 'completed', finishedAt: new Date() } }
      );

      piMetrics.recomputeCompleted(trigger, Date.now() - start);

      await eventService.emitEvent({
        featureKey: 'portfolio_intelligence_foundation',
        eventType: 'portfolio_intelligence.recompute_completed',
        userId,
        metadata: {
          correlationId,
          ingestRevision: normalized.ingestRevision,
          analyticsRevision,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      piMetrics.recomputeFailed(trigger);
      await PiRecomputeJobModel.updateOne(
        { jobId },
        { $set: { status: 'failed', finishedAt: new Date(), error: message } }
      );
      await eventService.emitEvent({
        featureKey: 'portfolio_intelligence_foundation',
        eventType: 'portfolio_intelligence.recompute_failed',
        userId,
        metadata: { correlationId, error: message },
      });
      throw err;
    }
  },
};
