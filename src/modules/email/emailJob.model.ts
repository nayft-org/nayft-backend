import mongoose, { Schema } from 'mongoose';
import type { EmailDeliveryTruth, EmailJobStatus, EmailProviderName } from './email.types';
import type { VerificationPurpose } from '../auth/verification/types';

export interface IEmailJob extends mongoose.Document {
  jobId: string;
  userId: mongoose.Types.ObjectId;
  purpose: VerificationPurpose;
  idempotencyKey: string;
  correlationId: string;
  status: EmailJobStatus;
  deliveryTruth: EmailDeliveryTruth;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lockOwner: string | null;
  provider: EmailProviderName | null;
  providerStatusCode: number | null;
  providerLatencyMs: number | null;
  providerAttemptedAt: Date | null;
  replayRequestId: string | null;
  traceId: string;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: Date;
}

const emailJobSchema = new Schema<IEmailJob>(
  {
    jobId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: {
      type: String,
      enum: ['email_signup', 'email_change', 'password_reset', 'mfa_setup'],
      required: true,
    },
    idempotencyKey: { type: String, required: true, unique: true },
    correlationId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'retrying', 'sent', 'failed', 'dlq', 'cancelled', 'abandoned'],
      default: 'pending',
    },
    deliveryTruth: {
      type: String,
      enum: ['queued', 'processing', 'provider_accepted', 'provider_rejected', 'delivered', 'bounced', 'suppressed', 'failed'],
      default: 'queued',
    },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    nextAttemptAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    lockOwner: { type: String, default: null },
    provider: { type: String, enum: ['mailtrap', 'mock', 'noop'], default: null },
    providerStatusCode: { type: Number, default: null },
    providerLatencyMs: { type: Number, default: null },
    providerAttemptedAt: { type: Date, default: null },
    replayRequestId: { type: String, default: null },
    traceId: { type: String, required: true },
    providerMessageId: { type: String, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

emailJobSchema.index({ status: 1, createdAt: 1 });
emailJobSchema.index({ deliveryTruth: 1, createdAt: 1 });
emailJobSchema.index({ userId: 1, createdAt: -1 });
emailJobSchema.index({ correlationId: 1 }, { unique: false });
emailJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const EmailJob = mongoose.model<IEmailJob>('EmailJob', emailJobSchema);
