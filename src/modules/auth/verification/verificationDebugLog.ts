import { config } from '../../../config/env';

/**
 * Dev/staging only — NEVER logs verification codes in production.
 */
export function logVerificationCodeForDev(email: string, code: string, expiresInHours: number): void {
  if (config.nodeEnv === 'production') {
    throw new Error('Verification code logging is forbidden in production');
  }
  if (!config.emailVerificationDebugLog) {
    return;
  }
  console.log(
    `[NAYFT AUTH]\nVerification code generated for ${email}\nCode: ${code}\nExpires in: ${expiresInHours}h`
  );
}
