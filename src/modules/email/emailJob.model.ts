import mongoose, { Schema } from 'mongoose';
import type { EmailJobStatus } from './email.types';
import type { VerificationPurpose } from '../auth/verification/types';

export interface IEmailJob extends mongoose.Document {
  jobId: string;
  userId: mongoose.Types.ObjectId;
  purpose: VerificationPurpose;
  idempotencyKey: string;
  correlationId: string;
  status: EmailJobStatus;
  attemptCount: number;
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
      enum: ['pending', 'sent', 'failed', 'dlq'],
      default: 'pending',
    },
    attemptCount: { type: Number, default: 0 },
    providerMessageId: { type: String, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

emailJobSchema.index({ status: 1, createdAt: 1 });
emailJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const EmailJob = mongoose.model<IEmailJob>('EmailJob', emailJobSchema);
