import { redis } from '../../config/redis';
import { notifThrottleKey } from './redisKeys';

/** Fixed-window throttle: max `limit` hits per `windowSec`. */
export async function throttleAllow(
  userId: string,
  policy: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  const key = notifThrottleKey(userId, policy);
  const n = await redis.incr(key);
  if (n === 1) {
    await redis.expire(key, windowSec);
  }
  return n <= limit;
}
