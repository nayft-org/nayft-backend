import { emailQueue, type PoppedEmailJob } from './email.queue';
import { emailConfig } from './email.config';
import { emailLogger } from './email.logger';
import type { VerificationEmailJob } from './email.types';

export type EmailQueueAdapter = {
  backend: 'redis-list' | 'bullmq';
  enqueue: (job: VerificationEmailJob) => Promise<void>;
  enqueueDelayed: (job: VerificationEmailJob, executeAtMs: number) => Promise<void>;
  popBlocking: (timeoutSeconds?: number) => Promise<PoppedEmailJob | null>;
  ack: (raw: string) => Promise<void>;
  pushToDlq: (job: VerificationEmailJob, reason?: string) => Promise<void>;
  promoteDelayed: () => Promise<void>;
  getQueueDepth: () => Promise<number>;
  getProcessingDepth: () => Promise<number>;
  getDlqDepth: () => Promise<number>;
  requeueStuckProcessing: (limit?: number) => Promise<number>;
  peekDlq: (limit?: number) => Promise<string[]>;
  requeueDlqJobById: (jobId: string) => Promise<boolean>;
};

const redisListAdapter: EmailQueueAdapter = {
  backend: 'redis-list',
  enqueue: (job) => emailQueue.enqueue(job),
  enqueueDelayed: (job, executeAtMs) => emailQueue.enqueueDelayed(job, executeAtMs),
  popBlocking: (timeoutSeconds) => emailQueue.popBlocking(timeoutSeconds),
  ack: (raw) => emailQueue.ack(raw),
  pushToDlq: (job, reason) => emailQueue.pushToDlq(job, reason),
  promoteDelayed: () => emailQueue.promoteDelayed(),
  getQueueDepth: () => emailQueue.getQueueDepth(),
  getProcessingDepth: () => emailQueue.getProcessingDepth(),
  getDlqDepth: () => emailQueue.getDlqDepth(),
  requeueStuckProcessing: (limit) => emailQueue.requeueStuckProcessing(limit),
  peekDlq: (limit) => emailQueue.peekDlq(limit),
  requeueDlqJobById: (jobId) => emailQueue.requeueDlqJobById(jobId),
};

export function getEmailQueueAdapter(): EmailQueueAdapter {
  if (emailConfig.queueBackend === 'bullmq') {
    emailLogger.warn('email_queue_backend_fallback', {
      requestedBackend: 'bullmq',
      selectedBackend: 'redis-list',
      reason: 'BullMQ adapter not yet enabled in this deployment',
    });
  }
  return redisListAdapter;
}

