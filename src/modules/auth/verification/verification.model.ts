import mongoose, { Schema } from 'mongoose';
import type { VerificationOutcome, VerificationPurpose } from './types';

export interface IEmailVerification extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  purpose: VerificationPurpose;
  codeHash: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  supersededAt: Date | null;
  attemptCount: number;
  locale: string;
  correlationId: string;
  ipHash: string;
  outcome: VerificationOutcome;
  emailJobId: string | null;
  createdAt: Date;
}

const emailVerificationSchema = new Schema<IEmailVerification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: {
      type: String,
      enum: ['email_signup', 'email_change', 'password_reset', 'mfa_setup'],
      required: true,
    },
    codeHash: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    supersededAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0 },
    locale: { type: String, default: 'en' },
    correlationId: { type: String, required: true, index: true },
    ipHash: { type: String, default: '' },
    outcome: {
      type: String,
      enum: ['pending', 'consumed', 'expired', 'superseded', 'locked'],
      default: 'pending',
    },
    emailJobId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

emailVerificationSchema.index({ userId: 1, purpose: 1, consumedAt: 1 });
emailVerificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const EmailVerification = mongoose.model<IEmailVerification>(
  'EmailVerification',
  emailVerificationSchema
);
