import { config } from '../../config/env';

export const emailConfig = {
  maxAttempts: 5,
  retryBaseDelayMs: 30_000,
  retryCapDelayMs: 30 * 60_000,
  retryJitterRatio: 0.2,
  processingLockTtlMs: 180_000,
  processingLockRefreshMs: 30_000,
  workerHeartbeatTtlSec: 30,
  workerHeartbeatRefreshMs: 10_000,
  queueBackend: (process.env.EMAIL_QUEUE_BACKEND || 'redis-list').trim().toLowerCase() as
    | 'redis-list'
    | 'bullmq',
  strictProviderValidation:
    (process.env.EMAIL_STRICT_PROVIDER_VALIDATION || '').toLowerCase() === 'true' ||
    config.nodeEnv === 'production',
  environmentPrefix: (process.env.NODE_ENV || 'development').trim().toLowerCase(),
  replayThrottlePerMinute: Math.max(1, parseInt(process.env.EMAIL_REPLAY_THROTTLE_PER_MINUTE || '30', 10)),
};

export function emailKey(name: string): string {
  return `${emailConfig.environmentPrefix}:email:${name}`;
}

