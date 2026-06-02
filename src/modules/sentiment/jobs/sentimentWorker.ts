import { randomBytes } from 'crypto';
import { redis, redisBlocking } from '../../../config/redis';
import { sentimentConfig } from '../config/sentimentConfig';
import {
  ensureSentimentConsumerGroup,
  xaddSentimentDlq,
  xaddSentimentJob,
  type SentimentJobPayload,
} from '../services/sentimentQueue.service';
import {
  enrichArticleByExternalId,
  recoverStaleProcessingArticles,
} from '../services/sentimentEnrichment.service';
import { sentimentMetrics, recordScoringDuration } from '../../../observability/sentimentMetrics';
import { validateSentimentJobPayload } from '../utils/validateSentimentPayload';

function pairsFromFields(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    out[fields[i]] = fields[i + 1];
  }
  return out;
}

type StreamMsg = [id: string, fields: string[]];
type StreamReadResult = [name: string, messages: StreamMsg[]][] | null;

const WORKER_NAME = `sentiment-${process.pid}-${randomBytes(4).toString('hex')}`;
let lastAutoclaimAt = 0;
let lastStaleRecoveryAt = 0;

function logJob(
  level: 'info' | 'error',
  msg: string,
  meta: Record<string, unknown>
): void {
  const line = JSON.stringify({ component: 'SentimentWorker', msg, ...meta });
  if (level === 'error') console.error(line);
  else console.info(line);
}

async function moveToDlq(
  streamId: string,
  reason: string,
  extra: Record<string, string> = {}
): Promise<void> {
  await xaddSentimentDlq({ reason, original_id: streamId, ...extra });
  sentimentMetrics.dlqDepth = await redis.xlen(sentimentConfig.dlqStreamKey).catch(() => 0);
}

async function requeueWithRetry(job: SentimentJobPayload, streamId: string): Promise<void> {
  const nextAttempt = (job.attempt ?? 0) + 1;
  if (nextAttempt >= sentimentConfig.maxRetries) {
    await moveToDlq(streamId, 'max_retries_exceeded', {
      externalId: job.externalId,
      payload: JSON.stringify(job).slice(0, 2000),
    });
    return;
  }
  await xaddSentimentJob({
    ...job,
    attempt: nextAttempt,
    queuedAt: new Date().toISOString(),
  });
}

async function processStreamMessage(id: string, payloadJson: string): Promise<void> {
  const validated = validateSentimentJobPayload(payloadJson);
  if (!validated.ok) {
    await moveToDlq(id, validated.reason, { payload: payloadJson.slice(0, 500) });
    return;
  }

  const job = validated.job;
  const started = Date.now();
  const queuedAt = Date.parse(job.queuedAt);
  if (Number.isFinite(queuedAt)) {
    sentimentMetrics.queueLagMs = Math.max(0, Date.now() - queuedAt);
  }

  try {
    const result = await enrichArticleByExternalId(job.externalId, job.contentHash);
    if (result === 'skipped' || result === 'hash_mismatch') {
      sentimentMetrics.jobsSkippedTotal += 1;
      logJob('info', 'job_skipped', {
        correlationId: job.correlationId,
        externalId: job.externalId,
        result,
        durationMs: Date.now() - started,
      });
      return;
    }
    if (result === 'not_found') {
      sentimentMetrics.jobsFailedTotal += 1;
      await moveToDlq(id, 'article_not_found', { externalId: job.externalId });
      return;
    }
    if (result === 'failed') {
      sentimentMetrics.jobsFailedTotal += 1;
      await requeueWithRetry(job, id);
      logJob('error', 'job_failed', {
        correlationId: job.correlationId,
        externalId: job.externalId,
        attempt: job.attempt ?? 0,
      });
      return;
    }

    sentimentMetrics.jobsProcessedTotal += 1;
    logJob('info', 'job_ready', {
      correlationId: job.correlationId,
      externalId: job.externalId,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    sentimentMetrics.jobsFailedTotal += 1;
    console.error('[SentimentWorker] process failed', err);
    await requeueWithRetry(job, id);
  } finally {
    recordScoringDuration(Date.now() - started);
  }
}

async function runAutoclaimPass(): Promise<void> {
  const now = Date.now();
  if (now - lastAutoclaimAt < 60_000) return;
  lastAutoclaimAt = now;

  try {
    const raw = (await redis.call(
      'XAUTOCLAIM',
      sentimentConfig.streamKey,
      sentimentConfig.consumerGroup,
      WORKER_NAME,
      String(sentimentConfig.xautoclaimIdleMs),
      '0-0',
      'COUNT',
      String(sentimentConfig.xautoclaimBatch)
    )) as [string, StreamMsg[], StreamMsg[]] | null;

    if (!raw || !Array.isArray(raw[1])) return;

    for (const [id, fieldList] of raw[1]) {
      const kv = pairsFromFields(fieldList);
      const payloadJson = kv.payload;
      if (!payloadJson) {
        await moveToDlq(id, 'missing_payload');
        await redis.xack(sentimentConfig.streamKey, sentimentConfig.consumerGroup, id);
        continue;
      }
      await processStreamMessage(id, payloadJson);
      await redis.xack(sentimentConfig.streamKey, sentimentConfig.consumerGroup, id);
    }
  } catch (err) {
    console.error('[SentimentWorker] XAUTOCLAIM error', err);
  }

  if (now - lastStaleRecoveryAt >= 60_000) {
    lastStaleRecoveryAt = now;
    const recovered = await recoverStaleProcessingArticles();
    if (recovered > 0) {
      sentimentMetrics.processingStaleCount = recovered;
      logJob('info', 'stale_processing_recovered', { count: recovered });
    }
  }
}

export async function runSentimentStreamWorker(): Promise<void> {
  if (!sentimentConfig.workerEnabled) {
    console.log('[SentimentWorker] disabled (SENTIMENT_WORKER_ENABLED=false)');
    return;
  }

  await ensureSentimentConsumerGroup();
  console.log('[SentimentWorker] started', WORKER_NAME);

  for (;;) {
    try {
      await runAutoclaimPass();

      const raw = (await redisBlocking.call(
        'XREADGROUP',
        'GROUP',
        sentimentConfig.consumerGroup,
        WORKER_NAME,
        'BLOCK',
        '5000',
        'COUNT',
        '25',
        'STREAMS',
        sentimentConfig.streamKey,
        '>'
      )) as StreamReadResult | null;

      if (!raw) continue;

      for (const [, messages] of raw) {
        for (const [id, fieldList] of messages) {
          const kv = pairsFromFields(fieldList);
          const payloadJson = kv.payload;
          if (!payloadJson) {
            await moveToDlq(id, 'missing_payload');
            await redis.xack(sentimentConfig.streamKey, sentimentConfig.consumerGroup, id);
            continue;
          }

          await processStreamMessage(id, payloadJson);
          await redis.xack(sentimentConfig.streamKey, sentimentConfig.consumerGroup, id);
        }
      }

      sentimentMetrics.queueDepth = await redis.xlen(sentimentConfig.streamKey).catch(() => 0);
      sentimentMetrics.dlqDepth = await redis.xlen(sentimentConfig.dlqStreamKey).catch(() => 0);
    } catch (err) {
      console.error('[SentimentWorker] loop error', err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
