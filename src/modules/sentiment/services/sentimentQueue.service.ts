import { randomUUID } from 'crypto';
import { redis } from '../../../config/redis';
import { sentimentConfig } from '../config/sentimentConfig';
import { sentimentMetrics } from '../../../observability/sentimentMetrics';

export type SentimentJobPayload = {
  externalId: string;
  contentHash: string;
  queuedAt: string;
  attempt?: number;
  correlationId?: string;
};

export async function ensureSentimentConsumerGroup(): Promise<void> {
  try {
    await redis.xgroup(
      'CREATE',
      sentimentConfig.streamKey,
      sentimentConfig.consumerGroup,
      '0',
      'MKSTREAM'
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('BUSYGROUP')) throw err;
  }
}

export async function getSentimentStreamDepth(): Promise<number> {
  return Number(await redis.xlen(sentimentConfig.streamKey)) || 0;
}

export async function xaddSentimentJob(payload: SentimentJobPayload): Promise<void> {
  await redis.xadd(
    sentimentConfig.streamKey,
    'MAXLEN',
    '~',
    String(sentimentConfig.streamMaxLen),
    '*',
    'payload',
    JSON.stringify(payload)
  );
}

export async function xaddSentimentDlq(fields: Record<string, string>): Promise<void> {
  const pairs = Object.entries(fields).flat();
  await redis.xadd(
    sentimentConfig.dlqStreamKey,
    'MAXLEN',
    '~',
    String(sentimentConfig.dlqMaxLen),
    '*',
    ...pairs
  );
}

export async function enqueueSentimentJobs(
  jobs: Array<{ externalId: string; contentHash: string }>,
  options?: { bypassEnabled?: boolean }
): Promise<number> {
  if ((!sentimentConfig.enrichmentEnabled && !options?.bypassEnabled) || jobs.length === 0) {
    return 0;
  }

  const depth = await getSentimentStreamDepth();
  if (depth >= sentimentConfig.backpressureDepth) {
    sentimentMetrics.backpressureSkipsTotal += jobs.length;
    return 0;
  }

  const capped = jobs.slice(0, sentimentConfig.maxEnqueuePerCall);
  const queuedAt = new Date().toISOString();
  let enqueued = 0;

  for (const job of capped) {
    const payload: SentimentJobPayload = {
      externalId: job.externalId,
      contentHash: job.contentHash,
      queuedAt,
      attempt: 0,
      correlationId: randomUUID(),
    };
    await xaddSentimentJob(payload);
    enqueued += 1;
  }

  sentimentMetrics.jobsEnqueuedTotal += enqueued;
  return enqueued;
}
