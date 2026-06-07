import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { config } from '../../../config/env';
import type { VerificationPurpose } from './types';

const OTP_LENGTH = 6;
const OTP_MAX = 1_000_000;

function hmacKey(): Buffer {
  const secret = config.verificationCodeSecret;
  if (!secret) {
    throw new Error('VERIFICATION_CODE_SECRET is not configured');
  }
  return Buffer.from(secret, 'utf8');
}

export function hashVerificationCode(
  userId: string,
  purpose: VerificationPurpose,
  code: string
): string {
  return createHmac('sha256', hmacKey())
    .update(`${userId}:${purpose}:${code}`)
    .digest('hex');
}

export function generateVerificationCode(): string {
  let code: string;
  do {
    code = String(randomInt(0, OTP_MAX)).padStart(OTP_LENGTH, '0');
  } while (/^(\d)\1{5}$/.test(code));
  return code;
}

export function normalizeVerificationCodeInput(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!/^\d{6}$/.test(trimmed)) return null;
  return trimmed;
}

export function compareVerificationCodeHashes(storedHash: string, computedHash: string): boolean {
  try {
    const a = Buffer.from(storedHash, 'hex');
    const b = Buffer.from(computedHash, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
