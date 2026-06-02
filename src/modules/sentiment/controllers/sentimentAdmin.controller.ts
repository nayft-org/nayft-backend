import { Request, Response } from 'express';
import { NewsArticle } from '../../news/models/NewsArticle';
import {
  sentimentMetrics,
  evaluateSentimentHealthAlerts,
  getAverageScoringMs,
  getWorkerFailureRate,
} from '../../../observability/sentimentMetrics';
import { redis } from '../../../config/redis';
import { sentimentConfig } from '../config/sentimentConfig';
import { runCoinSentimentAggregation } from '../services/coinSentimentAggregator.service';
import { enqueueSentimentJobs } from '../services/sentimentQueue.service';
import { enrichArticleByExternalId } from '../services/sentimentEnrichment.service';
import { computeArticleContentHash } from '../utils/contentHash';

export const sentimentAdminController = {
  health: async (_req: Request, res: Response): Promise<void> => {
    let streamLen = 0;
    let dlqLen = 0;
    try {
      streamLen = Number(await redis.xlen(sentimentConfig.streamKey)) || 0;
      dlqLen = Number(await redis.xlen(sentimentConfig.dlqStreamKey)) || 0;
      sentimentMetrics.queueDepth = streamLen;
      sentimentMetrics.dlqDepth = dlqLen;
    } catch {
      streamLen = -1;
    }

    const [totalArticles, readyArticles, processingStale] = await Promise.all([
      NewsArticle.countDocuments({ status: 'active' }),
      NewsArticle.countDocuments({ status: 'active', sentimentStatus: 'ready' }),
      NewsArticle.countDocuments({
        sentimentStatus: 'processing',
        updatedAt: { $lt: new Date(Date.now() - sentimentConfig.staleProcessingMs) },
      }),
    ]);

    const readyRatio = totalArticles > 0 ? readyArticles / totalArticles : 0;
    const alerts = evaluateSentimentHealthAlerts();

    res.json({
      success: true,
      data: {
        enrichmentEnabled: sentimentConfig.enrichmentEnabled,
        workerEnabled: sentimentConfig.workerEnabled,
        apiEnabled: sentimentConfig.apiEnabled,
        queueDepth: streamLen,
        dlqDepth: dlqLen,
        jobsEnqueuedTotal: sentimentMetrics.jobsEnqueuedTotal,
        jobsProcessedTotal: sentimentMetrics.jobsProcessedTotal,
        jobsFailedTotal: sentimentMetrics.jobsFailedTotal,
        jobsSkippedTotal: sentimentMetrics.jobsSkippedTotal,
        backpressureSkipsTotal: sentimentMetrics.backpressureSkipsTotal,
        queueLagMs: sentimentMetrics.queueLagMs,
        workerFailureRate: getWorkerFailureRate(),
        averageScoringMs: Math.round(getAverageScoringMs()),
        aggregationDurationMs: sentimentMetrics.aggregationDurationMs,
        lastAggregationAt: sentimentMetrics.lastAggregationAt,
        articlesReadyRatio: readyRatio,
        processingStaleCount: processingStale,
        alerts,
      },
    });
  },

  reprocess: async (req: Request, res: Response): Promise<void> => {
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '90'), 10)));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '500'), 10)));
    const force = String(req.query.force || 'false') === 'true';
    const from = new Date(Date.now() - days * 24 * 3_600_000);

    const articles = await NewsArticle.find({
      status: 'active',
      publishedAt: { $gte: from },
    })
      .select('externalId title subtitle')
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean();

    if (force) {
      let processed = 0;
      for (const a of articles) {
        await enrichArticleByExternalId(a.externalId, undefined, { force: true });
        processed += 1;
      }
      res.json({ success: true, data: { mode: 'inline_force', processed } });
      return;
    }

    const jobs = articles.map((a) => ({
      externalId: a.externalId,
      contentHash: computeArticleContentHash(a.title, a.subtitle),
    }));
    const enqueued = await enqueueSentimentJobs(jobs, { bypassEnabled: true });
    res.json({ success: true, data: { mode: 'queue', enqueued } });
  },

  aggregate: async (_req: Request, res: Response): Promise<void> => {
    const result = await runCoinSentimentAggregation();
    res.json({ success: true, data: result });
  },
};
