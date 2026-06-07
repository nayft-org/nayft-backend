import { redis, redisBlocking } from '../../config/redis';
import type { VerificationEmailJob } from './email.types';

export const EMAIL_QUEUE_KEY = 'email:queue';
export const EMAIL_DLQ_KEY = 'email:failed';
export const EMAIL_DELAYED_KEY = 'email:delayed';

export const emailQueue = {
  async enqueue(job: VerificationEmailJob): Promise<void> {
    await redis.lpush(EMAIL_QUEUE_KEY, JSON.stringify(job));
  },

  async enqueueDelayed(job: VerificationEmailJob, executeAtMs: number): Promise<void> {
    await redis.zadd(EMAIL_DELAYED_KEY, executeAtMs, JSON.stringify(job));
  },

  async popBlocking(timeoutSeconds = 5): Promise<VerificationEmailJob | null> {
    const result = await redisBlocking.brpop(EMAIL_QUEUE_KEY, timeoutSeconds);
    if (!result) return null;
    try {
      return JSON.parse(result[1]) as VerificationEmailJob;
    } catch {
      return null;
    }
  },

  async pushToDlq(job: VerificationEmailJob): Promise<void> {
    await redis.lpush(EMAIL_DLQ_KEY, JSON.stringify(job));
  },

  async promoteDelayed(): Promise<void> {
    const now = Date.now();
    const items = await redis.zrangebyscore(EMAIL_DELAYED_KEY, 0, now);
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
};
