import type { VerificationPurpose } from '../auth/verification/types';

export type EmailJobStatus =
  | 'pending'
  | 'processing'
  | 'retrying'
  | 'sent'
  | 'failed'
  | 'dlq'
  | 'cancelled'
  | 'abandoned';

export type EmailDeliveryTruth =
  | 'queued'
  | 'processing'
  | 'provider_accepted'
  | 'provider_rejected'
  | 'delivered'
  | 'bounced'
  | 'suppressed'
  | 'failed';

export type TransactionalEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  correlationId: string;
};

export type VerificationEmailJob = {
  jobId: string;
  userId: string;
  purpose: VerificationPurpose;
  locale: string;
  email: string;
  username: string;
  code: string;
  correlationId: string;
  idempotencyKey: string;
  attempt: number;
  enqueuedAt: string;
  replayRequestId?: string;
};

export type EmailProviderName = 'mailtrap' | 'mock' | 'noop';

export type EmailAttemptClassification = 'transient' | 'permanent' | 'poison';
