import { EmailVerification, type IEmailVerification } from './verification.model';
import type { VerificationOutcome, VerificationPurpose } from './types';

export const verificationRepository = {
  async createAuditRecord(data: {
    userId: string;
    purpose: VerificationPurpose;
    codeHash: string;
    issuedAt: Date;
    expiresAt: Date;
    locale: string;
    correlationId: string;
    ipHash: string;
    emailJobId?: string | null;
  }): Promise<IEmailVerification> {
    return EmailVerification.create({
      ...data,
      outcome: 'pending' as VerificationOutcome,
      attemptCount: 0,
      consumedAt: null,
      supersededAt: null,
      emailJobId: data.emailJobId ?? null,
    });
  },

  async supersedePending(userId: string, purpose: VerificationPurpose): Promise<void> {
    await EmailVerification.updateMany(
      { userId, purpose, outcome: 'pending', consumedAt: null },
      { $set: { outcome: 'superseded', supersededAt: new Date() } }
    );
  },

  async markConsumed(id: string, attemptCount: number): Promise<void> {
    await EmailVerification.findByIdAndUpdate(id, {
      $set: { outcome: 'consumed', consumedAt: new Date(), attemptCount },
    });
  },

  async markExpired(id: string): Promise<void> {
    await EmailVerification.findByIdAndUpdate(id, { $set: { outcome: 'expired' } });
  },

  async markLocked(id: string, attemptCount: number): Promise<void> {
    await EmailVerification.findByIdAndUpdate(id, {
      $set: { outcome: 'locked', attemptCount },
    });
  },

  async findLatestPending(userId: string, purpose: VerificationPurpose): Promise<IEmailVerification | null> {
    return EmailVerification.findOne({ userId, purpose, outcome: 'pending' }).sort({ issuedAt: -1 });
  },
};
