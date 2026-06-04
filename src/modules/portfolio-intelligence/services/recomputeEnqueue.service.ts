import { createHash } from 'crypto';
import { redis } from '../../../config/redis';
import { piConfig } from '../config/piConfig';
import { piRedisKeys } from '../cache/piRedisKeys';
import type { PiRecomputeJob, PiTrigger } from '../contracts/piContracts';
import { piMetrics } from '../../../observability/piMetrics';
import { createCorrelationId } from '../utils/correlationId';

async function isEnqueuePaused(): Promise<boolean> {
  if (!piConfig.enqueueEnabled && !piConfig.workerEnabled) return true;
  const paused = await redis.get(piRedisKeys.enqueuePaused);
  if (paused === '1') return true;
  const depth = await redis.xlen(piRedisKeys.recomputeStream);
  piMetrics.queueDepth(depth);
  if (depth >= piConfig.backpressureDepth) {
    await redis.set(piRedisKeys.enqueuePaused, '1', 'EX', 60);
    return true;
  }
  if (depth < piConfig.backpressureResumeDepth) {
    await redis.del(piRedisKeys.enqueuePaused);
  }
  return false;
}

export const recomputeEnqueueService = {
  async enqueue(
    userId: string,
    trigger: PiTrigger,
    options?: { correlationId?: string; bypassDebounce?: boolean; highPriority?: boolean }
  ): Promise<boolean> {
    if (!piConfig.enabled && !piConfig.workerEnabled) return false;
    if (await isEnqueuePaused()) return false;

    const correlationId = options?.correlationId ?? createCorrelationId();
    await redis.set(
      piRedisKeys.pending(userId),
      correlationId,
      'EX',
      piConfig.pendingTtlSec
    );

    let shouldAdd = Boolean(options?.bypassDebounce);
    if (!shouldAdd) {
      const debounceSet = await redis.set(
        piRedisKeys.debounce(userId),
        '1',
        'PX',
        piConfig.debounceMs,
        'NX'
      );
      shouldAdd = debounceSet === 'OK';
    }

    if (!shouldAdd) return false;

    const job: PiRecomputeJob = {
      jobSchemaVersion: piConfig.jobSchemaVersion,
      userId,
      trigger,
      correlationId,
      enqueuedAt: new Date().toISOString(),
      attempt: 0,
    };

    const stream =
      options?.highPriority || trigger === 'manual'
        ? piRedisKeys.recomputeHigh
        : piRedisKeys.recomputeStream;

    await redis.xadd(
      stream,
      'MAXLEN',
      '~',
      String(piConfig.streamMaxLen),
      '*',
      'payload',
      JSON.stringify(job)
    );

    piMetrics.recomputeEnqueued(trigger);
    return true;
  },

  jobIdFor(userId: string, ingestRevision: number, catalogVersion: number): string {
    return createHash('sha256')
      .update(`${userId}:${ingestRevision}:${catalogVersion}`)
      .digest('hex')
      .slice(0, 24);
  },
};
