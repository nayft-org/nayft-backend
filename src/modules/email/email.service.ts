import { randomUUID } from 'crypto';
import { config } from '../../config/env';
import { EmailJob } from './emailJob.model';
import { emailQueue } from './email.queue';
import { renderVerificationEmail } from './templates/verificationTemplates';
import { mailtrapApiProvider } from './providers/mailtrapApi.provider';
import { noopEmailProvider } from './providers/noop.provider';
import type { TransactionalEmailPayload, VerificationEmailJob } from './email.types';
import type { VerificationPurpose } from '../auth/verification/types';
import { authMetrics } from '../../observability/authMetrics';
import { eventService } from '../../core/event-system';

const RETRY_DELAYS_MS = [0, 30_000, 120_000, 600_000];
const MAX_ATTEMPTS = 4;

function selectProvider() {
  if (config.emailProvider === 'mailtrap' && config.mailtrapApiToken) {
    return mailtrapApiProvider;
  }
  return noopEmailProvider;
}

async function sendWithProvider(payload: TransactionalEmailPayload): Promise<{ messageId: string }> {
  return selectProvider().sendTransactional(payload);
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
    const jobId = randomUUID();
    const idempotencyKey = `verify:${params.userId}:${params.purpose}:${params.issuedAt.toISOString()}`;

    await EmailJob.create({
      jobId,
      userId: params.userId,
      purpose: params.purpose,
      idempotencyKey,
      correlationId: params.correlationId,
      status: 'pending',
      attemptCount: 0,
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

    await emailQueue.enqueue(job);
    authMetrics.emailQueueDepth = await emailQueue.getQueueDepth();

    return { jobId, emailDeliveryStatus: 'queued' };
  },

  async processJob(job: VerificationEmailJob): Promise<void> {
    const processingKey = `email:processing:${job.idempotencyKey}`;
    const acquired = await import('../../config/redis').then(({ redis }) =>
      redis.set(processingKey, '1', 'EX', 300, 'NX')
    );
    if (acquired !== 'OK') return;

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

    try {
      const result = await sendWithProvider(payload);
      await EmailJob.findOneAndUpdate(
        { jobId: job.jobId },
        {
          $set: { status: 'sent', providerMessageId: result.messageId },
          $inc: { attemptCount: 1 },
        }
      );
      authMetrics.emailSendSuccessTotal += 1;

      eventService.emitEvent({
        featureKey: 'auth',
        eventType: 'verification_sent',
        userId: job.userId,
        metadata: { locale: job.locale, correlationId: job.correlationId },
      }).catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      const nextAttempt = job.attempt + 1;

      if (nextAttempt < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS_MS[nextAttempt] ?? 600_000;
        const retryJob: VerificationEmailJob = { ...job, attempt: nextAttempt };
        await emailQueue.enqueueDelayed(retryJob, Date.now() + delay);
        await EmailJob.findOneAndUpdate(
          { jobId: job.jobId },
          { $set: { lastError: message.slice(0, 200) }, $inc: { attemptCount: 1 } }
        );
        authMetrics.emailRetryTotal += 1;
      } else {
        await emailQueue.pushToDlq(job);
        await EmailJob.findOneAndUpdate(
          { jobId: job.jobId },
          { $set: { status: 'dlq', lastError: message.slice(0, 200) }, $inc: { attemptCount: 1 } }
        );
        authMetrics.emailDeliveryExhaustedTotal += 1;
        authMetrics.emailDlqDepth = await emailQueue.getDlqDepth();

        eventService.emitEvent({
          featureKey: 'auth',
          eventType: 'email_delivery_failed',
          userId: job.userId,
          metadata: { purpose: job.purpose, correlationId: job.correlationId },
        }).catch(() => {});
      }
    }
  },
};
