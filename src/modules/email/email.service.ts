import { randomUUID } from 'crypto';
import { config } from '../../config/env';
import { EmailJob } from './emailJob.model';
import { getEmailQueueAdapter } from './emailQueue.adapter';
import { renderVerificationEmail } from './templates/verificationTemplates';
import { mailtrapApiProvider } from './providers/mailtrapApi.provider';
import { mockEmailProvider } from './providers/mock.provider';
import { noopEmailProvider } from './providers/noop.provider';
import type { EmailAttemptClassification, EmailProviderName, TransactionalEmailPayload, VerificationEmailJob } from './email.types';
import type { VerificationPurpose } from '../auth/verification/types';
import { authMetrics } from '../../observability/authMetrics';
import { eventService } from '../../core/event-system';
import { redis } from '../../config/redis';
import { emailConfig } from './email.config';
import { emailRedisKeys } from './email.redisKeys';
import { emailLogger } from './email.logger';
import { classifyEmailError, computeRetryDelayMs } from './email.retry';

type ProviderResult = { messageId: string; statusCode: number };
type EmailProviderAdapter = {
  name: EmailProviderName;
  sendTransactional: (payload: TransactionalEmailPayload) => Promise<ProviderResult>;
};

function selectProvider(): EmailProviderAdapter {
  if (config.emailProvider === 'mailtrap' && config.mailtrapApiToken) {
    return {
      name: 'mailtrap',
      sendTransactional: (payload) => mailtrapApiProvider.sendTransactional(payload),
    };
  }
  if (config.emailProvider === 'mock') {
    return {
      name: 'mock',
      sendTransactional: (payload) => mockEmailProvider.sendTransactional(payload),
    };
  }
  if (config.emailProvider === 'noop' && config.nodeEnv !== 'production') {
    return {
      name: 'noop',
      sendTransactional: (payload) => noopEmailProvider.sendTransactional(payload),
    };
  }
  throw new Error(`Invalid email provider runtime selection: ${config.emailProvider}`);
}

async function sendWithProvider(payload: TransactionalEmailPayload): Promise<ProviderResult & { provider: EmailProviderName }> {
  const selected = selectProvider();
  const result = await selected.sendTransactional(payload);
  return { ...result, provider: selected.name };
}

async function safeEmitVerificationSent(userId: string, locale: string, correlationId: string): Promise<void> {
  try {
    await eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'verification_sent',
      userId,
      metadata: { locale, correlationId },
    });
  } catch (err) {
    emailLogger.error('event_emit_failed', {
      eventType: 'verification_sent',
      userId,
      correlationId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

async function safeEmitDeliveryFailed(userId: string, purpose: VerificationPurpose, correlationId: string): Promise<void> {
  try {
    await eventService.emitEvent({
      featureKey: 'auth',
      eventType: 'email_delivery_failed',
      userId,
      metadata: { purpose, correlationId },
    });
  } catch (err) {
    emailLogger.error('event_emit_failed', {
      eventType: 'email_delivery_failed',
      userId,
      correlationId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

function lockOwner(job: VerificationEmailJob): string {
  return `${process.pid}:${job.jobId}:${job.attempt}`;
}

async function acquireLock(job: VerificationEmailJob): Promise<{ key: string; owner: string; acquired: boolean }> {
  const key = emailRedisKeys.processingLock(job.jobId);
  const owner = lockOwner(job);
  const acquired = await redis.set(key, owner, 'PX', emailConfig.processingLockTtlMs, 'NX');
  return { key, owner, acquired: acquired === 'OK' };
}

async function releaseLock(key: string, owner: string): Promise<void> {
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    end
    return 0
  `;
  await redis.eval(script, 1, key, owner);
}

function buildIdempotencyKey(params: { userId: string; purpose: VerificationPurpose; correlationId: string }): string {
  return `verify:${params.userId}:${params.purpose}:${params.correlationId}`;
}

function shouldRetry(classification: EmailAttemptClassification, nextAttempt: number): boolean {
  if (classification !== 'transient') return false;
  return nextAttempt < emailConfig.maxAttempts;
}

export const emailService = {
  async enqueueVerificationEmail(params: {
    userId: string;
    purpose: VerificationPurpose;
    email: string;
    username: string;
    code: string;
    locale: string;
    correlationId: string;
    issuedAt: Date;
  }): Promise<{ jobId: string; emailDeliveryStatus: 'queued' | 'skipped' }> {
    const existing = await EmailJob.findOne({
      correlationId: params.correlationId,
      purpose: params.purpose,
      userId: params.userId,
      status: { $in: ['pending', 'processing', 'retrying'] },
    });
    if (existing) {
      emailLogger.warn('email_enqueue_duplicate_prevented', {
        jobId: existing.jobId,
        correlationId: params.correlationId,
        purpose: params.purpose,
      });
      return { jobId: existing.jobId, emailDeliveryStatus: 'queued' };
    }

    const jobId = randomUUID();
    const idempotencyKey = buildIdempotencyKey({
      userId: params.userId,
      purpose: params.purpose,
      correlationId: params.correlationId,
    });
    const traceId = `${params.correlationId}:${jobId}`;
    await EmailJob.create({
      jobId,
      userId: params.userId,
      purpose: params.purpose,
      idempotencyKey,
      correlationId: params.correlationId,
      status: 'pending',
      deliveryTruth: 'queued',
      attemptCount: 0,
      maxAttempts: emailConfig.maxAttempts,
      traceId,
    });

    const job: VerificationEmailJob = {
      jobId,
      userId: params.userId,
      purpose: params.purpose,
      locale: params.locale,
      email: params.email,
      username: params.username,
      code: params.code,
      correlationId: params.correlationId,
      idempotencyKey,
      attempt: 0,
      enqueuedAt: new Date().toISOString(),
    };

    try {
      const queue = getEmailQueueAdapter();
      await queue.enqueue(job);
      authMetrics.emailQueueDepth = await queue.getQueueDepth();
      emailLogger.info('email_enqueue_success', {
        jobId,
        correlationId: params.correlationId,
        purpose: params.purpose,
        userId: params.userId,
      });
    } catch (err) {
      await EmailJob.findOneAndUpdate(
        { jobId },
        {
          $set: {
            status: 'abandoned',
            deliveryTruth: 'failed',
            lastError: err instanceof Error ? err.message.slice(0, 200) : 'enqueue failed',
          },
        }
      );
      emailLogger.error('email_enqueue_failed', {
        jobId,
        correlationId: params.correlationId,
        error: err instanceof Error ? err.message : 'unknown',
      });
      throw err;
    }

    return { jobId, emailDeliveryStatus: 'queued' };
  },

  async processJob(job: VerificationEmailJob, rawQueuePayload: string): Promise<void> {
    const lock = await acquireLock(job);
    if (!lock.acquired) {
      authMetrics.emailLockCollisionTotal += 1;
      emailLogger.warn('email_lock_collision', { jobId: job.jobId, attempt: job.attempt });
      const delay = Math.max(5_000, Math.floor(Math.random() * 10_000));
      const queue = getEmailQueueAdapter();
      await queue.enqueueDelayed(job, Date.now() + delay);
      await queue.ack(rawQueuePayload);
      return;
    }

    const startedAt = Date.now();
    await EmailJob.findOneAndUpdate(
      { jobId: job.jobId },
      {
        $set: {
          status: 'processing',
          deliveryTruth: 'processing',
          lockOwner: lock.owner,
          lastAttemptAt: new Date(),
          nextAttemptAt: null,
        },
      }
    );

    try {
      const rendered = renderVerificationEmail(job.locale, {
        code: job.code,
        username: job.username,
        expiresInHours: 24,
        year: new Date().getFullYear(),
      });

      const payload: TransactionalEmailPayload = {
        to: job.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: job.idempotencyKey,
        correlationId: job.correlationId,
      };

      emailLogger.info('mailtrap_request_start', {
        jobId: job.jobId,
        correlationId: job.correlationId,
        provider: config.emailProvider,
        to: emailLogger.maskEmail(job.email),
      });

      const result = await sendWithProvider(payload);
      const latencyMs = Date.now() - startedAt;
      await EmailJob.findOneAndUpdate(
        { jobId: job.jobId },
        {
          $set: {
            status: 'sent',
            deliveryTruth: 'provider_accepted',
            provider: result.provider,
            providerStatusCode: result.statusCode,
            providerLatencyMs: latencyMs,
            providerAttemptedAt: new Date(),
            providerMessageId: result.messageId,
            lockOwner: null,
            lastError: null,
          },
          $inc: { attemptCount: 1 },
        }
      );
      authMetrics.emailSendSuccessTotal += 1;
      authMetrics.emailProviderAcceptedTotal += 1;
      const queue = getEmailQueueAdapter();
      await queue.ack(rawQueuePayload);
      emailLogger.info('mailtrap_response_received', {
        jobId: job.jobId,
        statusCode: result.statusCode,
        provider: result.provider,
        latencyMs,
      });
      await safeEmitVerificationSent(job.userId, job.locale, job.correlationId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      const nextAttempt = job.attempt + 1;
      const classification = classifyEmailError(err);
      const latencyMs = Date.now() - startedAt;
      authMetrics.emailProviderRejectedTotal += 1;
      emailLogger.error('email_send_failed', {
        jobId: job.jobId,
        attempt: nextAttempt,
        classification,
        latencyMs,
        error: message,
      });

      if (shouldRetry(classification, nextAttempt)) {
        const delay = computeRetryDelayMs(nextAttempt);
        const nextAttemptAt = new Date(Date.now() + delay);
        const retryJob: VerificationEmailJob = { ...job, attempt: nextAttempt };
        const queue = getEmailQueueAdapter();
        await queue.enqueueDelayed(retryJob, Date.now() + delay);
        await queue.ack(rawQueuePayload);
        await EmailJob.findOneAndUpdate(
          { jobId: job.jobId },
          {
            $set: {
              status: 'retrying',
              deliveryTruth: 'failed',
              nextAttemptAt,
              lastError: message.slice(0, 200),
              lockOwner: null,
            },
            $inc: { attemptCount: 1 },
          }
        );
        authMetrics.emailRetryTotal += 1;
        authMetrics.emailRetryScheduledTotal += 1;
        emailLogger.warn('email_retry_scheduled', {
          jobId: job.jobId,
          attempt: nextAttempt,
          delayMs: delay,
          nextAttemptAt: nextAttemptAt.toISOString(),
          classification,
        });
      } else {
        const queue = getEmailQueueAdapter();
        await queue.pushToDlq(job, classification);
        await queue.ack(rawQueuePayload);
        await EmailJob.findOneAndUpdate(
          { jobId: job.jobId },
          {
            $set: {
              status: classification === 'permanent' ? 'failed' : 'dlq',
              deliveryTruth: classification === 'permanent' ? 'provider_rejected' : 'failed',
              lastError: message.slice(0, 200),
              lockOwner: null,
              providerAttemptedAt: new Date(),
            },
            $inc: { attemptCount: 1 },
          }
        );
        authMetrics.emailDeliveryExhaustedTotal += 1;
        authMetrics.emailDlqDepth = await queue.getDlqDepth();
        authMetrics.emailRetryExhaustedTotal += 1;
        await safeEmitDeliveryFailed(job.userId, job.purpose, job.correlationId);
      }
    } finally {
      await releaseLock(lock.key, lock.owner).catch((err) => {
        emailLogger.error('email_lock_release_failed', {
          jobId: job.jobId,
          error: err instanceof Error ? err.message : 'unknown',
        });
      });
    }
  },

  async getHealthSnapshot(): Promise<Record<string, unknown>> {
    const queue = getEmailQueueAdapter();
    const [queueDepth, processingDepth, dlqDepth, pendingCount, retryingCount] = await Promise.all([
      queue.getQueueDepth(),
      queue.getProcessingDepth(),
      queue.getDlqDepth(),
      EmailJob.countDocuments({ status: 'pending' }),
      EmailJob.countDocuments({ status: 'retrying' }),
    ]);
    return {
      provider: config.emailProvider,
      queueDepth,
      processingDepth,
      dlqDepth,
      pendingCount,
      retryingCount,
      maxAttempts: emailConfig.maxAttempts,
      workerHeartbeatKey: emailRedisKeys.workerHeartbeat,
    };
  },

  async getJobById(jobId: string) {
    return EmailJob.findOne({ jobId }).lean();
  },

  async replayJob(jobId: string, replayRequestId: string, actor: string, reason: string): Promise<{ replayed: boolean }> {
    const guardKey = emailRedisKeys.replayGuard(replayRequestId);
    const guardOk = await redis.set(guardKey, '1', 'EX', 60, 'NX');
    if (guardOk !== 'OK') {
      throw new Error('Replay request already processed');
    }
    const replayed = await getEmailQueueAdapter().requeueDlqJobById(jobId);
    if (!replayed) return { replayed: false };
    await EmailJob.findOneAndUpdate(
      { jobId },
      {
        $set: {
          status: 'pending',
          deliveryTruth: 'queued',
          replayRequestId,
          lockOwner: null,
          nextAttemptAt: null,
          lastError: `Replayed by ${actor}: ${reason}`.slice(0, 200),
        },
      }
    );
    emailLogger.warn('email_dlq_replayed', { jobId, replayRequestId, actor, reason });
    return { replayed: true };
  },
};
