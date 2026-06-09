import { redis, redisBlocking } from '../../config/redis';
import type { VerificationEmailJob } from './email.types';
import { emailRedisKeys } from './email.redisKeys';
import { emailLogger } from './email.logger';

export const EMAIL_QUEUE_KEY = emailRedisKeys.queue;
export const EMAIL_DLQ_KEY = emailRedisKeys.dlq;
export const EMAIL_DELAYED_KEY = emailRedisKeys.delayed;
export const EMAIL_PROCESSING_KEY = emailRedisKeys.processingQueue;

export type PoppedEmailJob = {
  job: VerificationEmailJob;
  raw: string;
};

export const emailQueue = {
  async enqueue(job: VerificationEmailJob): Promise<void> {
    await redis.lpush(EMAIL_QUEUE_KEY, JSON.stringify(job));
  },

  async enqueueDelayed(job: VerificationEmailJob, executeAtMs: number): Promise<void> {
    await redis.zadd(EMAIL_DELAYED_KEY, executeAtMs, JSON.stringify(job));
  },

  async popBlocking(timeoutSeconds = 5): Promise<PoppedEmailJob | null> {
    const raw = await redisBlocking.brpoplpush(EMAIL_QUEUE_KEY, EMAIL_PROCESSING_KEY, timeoutSeconds);
    if (!raw) return null;
    try {
      return { job: JSON.parse(raw) as VerificationEmailJob, raw };
    } catch (err) {
      emailLogger.error('email_queue_invalid_json', {
        error: err instanceof Error ? err.message : 'unknown',
      });
      await redis.lrem(EMAIL_PROCESSING_KEY, 1, raw);
      return null;
    }
  },

  async ack(raw: string): Promise<void> {
    await redis.lrem(EMAIL_PROCESSING_KEY, 1, raw);
  },

  async pushToDlq(job: VerificationEmailJob, reason = 'unknown'): Promise<void> {
    const payload = JSON.stringify({ ...job, dlqReason: reason, dlqAt: new Date().toISOString() });
    await redis.lpush(EMAIL_DLQ_KEY, payload);
  },

  async promoteDelayed(): Promise<void> {
    const now = Date.now();
    const items = await redis.zrangebyscore(EMAIL_DELAYED_KEY, 0, now, 'LIMIT', 0, 100);
    if (items.length === 0) return;
    for (const item of items) {
      await redis.lpush(EMAIL_QUEUE_KEY, item);
      await redis.zrem(EMAIL_DELAYED_KEY, item);
    }
  },

  async getQueueDepth(): Promise<number> {
    return redis.llen(EMAIL_QUEUE_KEY);
  },

  async getDlqDepth(): Promise<number> {
    return redis.llen(EMAIL_DLQ_KEY);
  },

  async getProcessingDepth(): Promise<number> {
    return redis.llen(EMAIL_PROCESSING_KEY);
  },

  async peekDlq(limit = 50): Promise<string[]> {
    return redis.lrange(EMAIL_DLQ_KEY, 0, Math.max(0, limit - 1));
  },

  async requeueDlqJobById(jobId: string): Promise<boolean> {
    const items = await this.peekDlq(500);
    for (const item of items) {
      try {
        const parsed = JSON.parse(item) as VerificationEmailJob & { dlqReason?: string };
        if (parsed.jobId !== jobId) continue;
        await redis.lrem(EMAIL_DLQ_KEY, 1, item);
        const replayJob: VerificationEmailJob = {
          ...parsed,
          attempt: 0,
          replayRequestId: `manual-${Date.now()}`,
        };
        await redis.lpush(EMAIL_QUEUE_KEY, JSON.stringify(replayJob));
        return true;
      } catch {
        // Ignore malformed item during lookup.
      }
    }
    return false;
  },

  async requeueStuckProcessing(limit = 100): Promise<number> {
    let moved = 0;
    for (let i = 0; i < limit; i += 1) {
      const raw = await redis.rpoplpush(EMAIL_PROCESSING_KEY, EMAIL_QUEUE_KEY);
      if (!raw) break;
      moved += 1;
    }
    return moved;
  },
};
