import { config } from '../../config/env';

/**
 * Simple in-process token bucket per API key + global bucket (MVP).
 * For multi-process deployments, prefer Redis-backed limiter later.
 */
export class CoindcxRateLimiter {
  private readonly perKeyIntervalMs: number;
  private readonly globalIntervalMs: number;
  private nextGlobalAt = 0;
  private readonly keyNextAt = new Map<string, number>();

  constructor() {
    const rpmKey = config.coindcxRpmPerKey;
    const rpmGlobal = config.coindcxRpmGlobal;
    this.perKeyIntervalMs = Math.ceil(60_000 / rpmKey);
    this.globalIntervalMs = Math.ceil(60_000 / rpmGlobal);
  }

  async acquire(apiKey: string): Promise<void> {
    const now = Date.now();
    const keyWaitUntil = this.keyNextAt.get(apiKey) ?? 0;
    const waitUntil = Math.max(now, keyWaitUntil, this.nextGlobalAt);
    const delay = waitUntil - now;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const t = Date.now();
    this.keyNextAt.set(apiKey, t + this.perKeyIntervalMs);
    this.nextGlobalAt = t + this.globalIntervalMs;
  }
}

export const coindcxRateLimiter = new CoindcxRateLimiter();
