import { redis } from '../../../config/redis';
import { createHash } from 'crypto';

const COOLDOWN_SECONDS = 60;
const MAX_RESENDS_PER_HOUR = 3;
const MAX_RESENDS_PER_DAY = 10;
const MAX_RESENDS_PER_IP_HOUR = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;

function ipHash(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export const verificationRateLimit = {
  async isResendCooldownActive(userId: string): Promise<boolean> {
    const key = `verify:resend:cooldown:${userId}`;
    const exists = await redis.exists(key);
    return exists === 1;
  },

  async getResendCooldownSeconds(userId: string): Promise<number> {
    const key = `verify:resend:cooldown:${userId}`;
    const ttl = await redis.ttl(key);
    return ttl > 0 ? ttl : 0;
  },

  async setResendCooldown(userId: string): Promise<void> {
    await redis.set(`verify:resend:cooldown:${userId}`, '1', 'EX', COOLDOWN_SECONDS);
  },

  async checkResendLimits(userId: string, ip: string): Promise<{ ok: true } | { ok: false; reason: 'cooldown' | 'hourly' | 'daily' | 'ip' }> {
    if (await this.isResendCooldownActive(userId)) {
      return { ok: false, reason: 'cooldown' };
    }

    const hourKey = `verify:resend:count:${userId}`;
    const hourCount = parseInt((await redis.get(hourKey)) || '0', 10);
    if (hourCount >= MAX_RESENDS_PER_HOUR) {
      return { ok: false, reason: 'hourly' };
    }

    const dayKey = `verify:resend:daily:${userId}`;
    const dayCount = parseInt((await redis.get(dayKey)) || '0', 10);
    if (dayCount >= MAX_RESENDS_PER_DAY) {
      return { ok: false, reason: 'daily' };
    }

    const ipKey = `verify:resend:ip:${ipHash(ip)}`;
    const ipCount = parseInt((await redis.get(ipKey)) || '0', 10);
    if (ipCount >= MAX_RESENDS_PER_IP_HOUR) {
      return { ok: false, reason: 'ip' };
    }

    return { ok: true };
  },

  async recordResend(userId: string, ip: string): Promise<number> {
    await this.setResendCooldown(userId);

    const hourKey = `verify:resend:count:${userId}`;
    const hourCount = await redis.incr(hourKey);
    if (hourCount === 1) {
      await redis.expire(hourKey, 3600);
    }

    const dayKey = `verify:resend:daily:${userId}`;
    const dayCount = await redis.incr(dayKey);
    if (dayCount === 1) {
      await redis.expire(dayKey, 86400);
    }

    const ipKey = `verify:resend:ip:${ipHash(ip)}`;
    const ipCount = await redis.incr(ipKey);
    if (ipCount === 1) {
      await redis.expire(ipKey, 3600);
    }

    return hourCount;
  },

  async isVerifyLocked(userId: string): Promise<boolean> {
    const key = `verify:locked:${userId}`;
    return (await redis.exists(key)) === 1;
  },

  async recordVerifyAttempt(userId: string): Promise<{ locked: boolean; attemptNumber: number }> {
    const key = `verify:attempts:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, LOCKOUT_SECONDS);
    }
    if (count >= MAX_VERIFY_ATTEMPTS) {
      await redis.set(`verify:locked:${userId}`, '1', 'EX', LOCKOUT_SECONDS);
      return { locked: true, attemptNumber: count };
    }
    return { locked: false, attemptNumber: count };
  },

  async clearVerifyAttempts(userId: string): Promise<void> {
    await redis.del(`verify:attempts:${userId}`, `verify:locked:${userId}`);
  },
};
