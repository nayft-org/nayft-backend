import { redis } from '../../config/redis';
import { notifDedupeKey } from './redisKeys';

/** Skip duplicate materialization within TTL seconds. */
export async function dedupeAllow(userId: string, hash: string, ttlSec: number): Promise<boolean> {
  const key = notifDedupeKey(userId, hash);
  const ok = await redis.set(key, '1', 'EX', ttlSec, 'NX');
  return ok === 'OK';
}
