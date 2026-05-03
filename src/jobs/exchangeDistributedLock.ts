import { redis } from '../config/redis';
import { config } from '../config/env';

const PREFIX = 'portfolio:exchange:sync:';

export async function tryAcquireExchangeSyncLock(connectionId: string): Promise<boolean> {
  const key = `${PREFIX}${connectionId}`;
  const ok = await redis.set(key, '1', 'PX', config.exchangeLockTtlMs, 'NX');
  return ok === 'OK';
}

export async function releaseExchangeSyncLock(connectionId: string): Promise<void> {
  const key = `${PREFIX}${connectionId}`;
  await redis.del(key).catch(() => {});
}
