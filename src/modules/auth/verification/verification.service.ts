import { randomUUID, createHash } from 'crypto';
import { redis } from '../../../config/redis';
import { authRepository } from '../repository';
import { verificationRepository } from './verification.repository';
import {
  compareVerificationCodeHashes,
  generateVerificationCode,
  hashVerificationCode,
  normalizeVerificationCodeInput,
} from './verificationCode.util';
import { verificationRateLimit } from './verificationRateLimit';
import { logVerificationCodeForDev } from './verificationDebugLog';
import type { VerificationFailReason, VerificationPurpose } from './types';

const OTP_TTL_SECONDS = 24 * 3600;
const OTP_TTL_HOURS = 24;

type StoredOtpPayload = {
  codeHash: string;
  issuedAt: string;
  expiresAt: string;
  correlationId: string;
  auditId: string;
};

function otpRedisKey(userId: string, purpose: VerificationPurpose): string {
  return `verify:otp:${userId}:${purpose}`;
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function parseStored(raw: string | null): StoredOtpPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredOtpPayload;
  } catch {
    return null;
  }
}

export type IssueCodeResult = {
  code: string;
  correlationId: string;
  expiresAt: Date;
};

export const verificationService = {
  async issueCode(
    userId: string,
    purpose: VerificationPurpose,
    options: { locale?: string; ip?: string; email: string; username: string }
  ): Promise<IssueCodeResult> {
    const code = generateVerificationCode();
    const correlationId = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + OTP_TTL_SECONDS * 1000);
    const codeHash = hashVerificationCode(userId, purpose, code);

    await verificationRepository.supersedePending(userId, purpose);

    const audit = await verificationRepository.createAuditRecord({
      userId,
      purpose,
      codeHash,
      issuedAt,
      expiresAt,
      locale: options.locale || 'en',
      correlationId,
      ipHash: options.ip ? hashIp(options.ip) : '',
    });

    const payload: StoredOtpPayload = {
      codeHash,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      correlationId,
      auditId: audit._id.toString(),
    };

    await redis.set(otpRedisKey(userId, purpose), JSON.stringify(payload), 'EX', OTP_TTL_SECONDS);
    await authRepository.updateVerificationSent(userId);

    logVerificationCodeForDev(options.email, code, OTP_TTL_HOURS);

    return {
      code,
      correlationId,
      expiresAt,
    };
  },

  async verifyCode(
    userId: string,
    purpose: VerificationPurpose,
    rawCode: string
  ): Promise<
    | { ok: true; correlationId: string }
    | { ok: false; reason: VerificationFailReason; correlationId?: string; attemptNumber?: number }
  > {
    if (await verificationRateLimit.isVerifyLocked(userId)) {
      return { ok: false, reason: 'locked' };
    }

    const normalized = normalizeVerificationCodeInput(rawCode);
    if (!normalized) {
      const attempt = await verificationRateLimit.recordVerifyAttempt(userId);
      return { ok: false, reason: 'invalid', attemptNumber: attempt.attemptNumber };
    }

    const stored = parseStored(await redis.get(otpRedisKey(userId, purpose)));
    if (!stored) {
      return { ok: false, reason: 'expired' };
    }

    if (new Date(stored.expiresAt).getTime() < Date.now()) {
      await verificationRepository.markExpired(stored.auditId);
      await redis.del(otpRedisKey(userId, purpose));
      return { ok: false, reason: 'expired', correlationId: stored.correlationId };
    }

    const computed = hashVerificationCode(userId, purpose, normalized);
    if (!compareVerificationCodeHashes(stored.codeHash, computed)) {
      const attempt = await verificationRateLimit.recordVerifyAttempt(userId);
      if (attempt.locked) {
        await verificationRepository.markLocked(stored.auditId, attempt.attemptNumber);
      }
      return {
        ok: false,
        reason: attempt.locked ? 'locked' : 'invalid',
        correlationId: stored.correlationId,
        attemptNumber: attempt.attemptNumber,
      };
    }

    await redis.del(otpRedisKey(userId, purpose));
    await verificationRateLimit.clearVerifyAttempts(userId);
    await verificationRepository.markConsumed(stored.auditId, 0);
    await authRepository.markEmailVerified(userId);

    return { ok: true, correlationId: stored.correlationId };
  },

  async resendCode(
    userId: string,
    purpose: VerificationPurpose,
    options: { locale?: string; ip?: string; email: string; username: string }
  ): Promise<
    | { ok: true; code: string; correlationId: string; expiresAt: Date; attemptNumber: number }
    | { ok: false; reason: 'cooldown' | 'hourly' | 'daily' | 'ip' | 'already_verified'; cooldownSeconds?: number }
  > {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (user.emailVerified) {
      return { ok: false, reason: 'already_verified' };
    }

    const limits = await verificationRateLimit.checkResendLimits(userId, options.ip || 'unknown');
    if (!limits.ok) {
      const cooldownSeconds =
        limits.reason === 'cooldown'
          ? await verificationRateLimit.getResendCooldownSeconds(userId)
          : undefined;
      return { ok: false, reason: limits.reason, cooldownSeconds };
    }

    const issued = await this.issueCode(userId, purpose, options);
    const attemptNumber = await verificationRateLimit.recordResend(userId, options.ip || 'unknown');

    return {
      ok: true,
      code: issued.code,
      correlationId: issued.correlationId,
      expiresAt: issued.expiresAt,
      attemptNumber,
    };
  },

  async getVerificationStatus(userId: string, purpose: VerificationPurpose = 'email_signup') {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const stored = parseStored(await redis.get(otpRedisKey(userId, purpose)));
    const cooldownSeconds = await verificationRateLimit.getResendCooldownSeconds(userId);
    const locked = await verificationRateLimit.isVerifyLocked(userId);

    return {
      emailVerified: Boolean(user.emailVerified),
      canResend: cooldownSeconds === 0 && !user.emailVerified && !locked,
      cooldownSecondsRemaining: cooldownSeconds,
      codeExpiresAt: stored?.expiresAt ?? null,
      locked,
    };
  },
};
