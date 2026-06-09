import type { EmailAttemptClassification } from './email.types';
import { emailConfig } from './email.config';

export function classifyEmailError(error: unknown): EmailAttemptClassification {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  if (msg.includes('invalid json') || msg.includes('template') || msg.includes('serialization')) {
    return 'poison';
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('422') || msg.includes('token is not configured')) {
    return 'permanent';
  }
  return 'transient';
}

export function computeRetryDelayMs(attempt: number): number {
  const exp = Math.min(emailConfig.retryCapDelayMs, emailConfig.retryBaseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = exp * emailConfig.retryJitterRatio;
  const random = (Math.random() * 2 - 1) * jitter;
  return Math.max(1_000, Math.round(exp + random));
}

