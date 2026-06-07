import type { VerificationPurpose } from '../auth/verification/types';

export type EmailJobStatus = 'pending' | 'sent' | 'failed' | 'dlq';

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
};
