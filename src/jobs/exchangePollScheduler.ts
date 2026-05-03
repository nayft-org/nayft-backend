import { config } from '../config/env';
import { portfolioRepository } from '../modules/portfolio/repository';
import { tryAcquireExchangeSyncLock, releaseExchangeSyncLock } from './exchangeDistributedLock';
import { runCoindcxSyncForConnection } from './exchangeConnectionSync';

function connectionIdString(id: unknown): string {
  if (typeof id === 'string') return id;
  if (id && typeof (id as { toString(): string }).toString === 'function') {
    return (id as { toString(): string }).toString();
  }
  return String(id);
}

/**
 * One scheduler tick: process due CoinDCX connections (Redis-locked, serialized per connection id).
 */
export async function runExchangePollTick(): Promise<void> {
  if (!config.exchangePortfolioEnabled) return;

  const batch = config.exchangePollBatchSize;
  const list = await portfolioRepository.findExchangeConnectionsDueForPoll(batch);
  for (const conn of list) {
    const id = connectionIdString(conn._id);
    let lockHeld = false;
    try {
      const acquired = await tryAcquireExchangeSyncLock(id);
      if (!acquired) {
        continue;
      }
      lockHeld = true;
      await runCoindcxSyncForConnection(conn);
    } catch (err) {
      console.error('[ExchangePoll] sync failed', { connectionId: id, err: (err as Error).message });
      await portfolioRepository.updateExchangeConnectionById(id, {
        lastErrorAt: new Date(),
        lastErrorMessage: (err as Error).message?.slice(0, 500),
        nextPollAt: new Date(Date.now() + 60_000),
      });
    } finally {
      if (lockHeld) {
        await releaseExchangeSyncLock(id).catch(() => {});
      }
    }
  }
}

let intervalRef: ReturnType<typeof setInterval> | null = null;

/**
 * When `EXCHANGE_SCHEDULER_COLOCATED=true` (default), run the poller in-process with the API.
 */
export function startExchangePollScheduler(): () => void {
  if (!config.exchangePortfolioEnabled) {
    console.log('[ExchangePoll] disabled (EXCHANGE_PORTFOLIO_ENABLED=false)');
    return () => {};
  }
  if (!config.exchangeSchedulerColocated) {
    console.log('[ExchangePoll] colocated scheduler off (EXCHANGE_SCHEDULER_COLOCATED=false)');
    return () => {};
  }

  if (intervalRef) {
    return () => {
      if (intervalRef) clearInterval(intervalRef);
      intervalRef = null;
    };
  }

  const tickMs = config.exchangeSchedulerTickMs;
  console.log(`[ExchangePoll] colocated scheduler every ${tickMs}ms (batch ${config.exchangePollBatchSize})`);

  void runExchangePollTick().catch((e) => console.error('[ExchangePoll] initial tick', e));
  intervalRef = setInterval(() => {
    runExchangePollTick().catch((e) => console.error('[ExchangePoll] tick', e));
  }, tickMs);

  return () => {
    if (intervalRef) clearInterval(intervalRef);
    intervalRef = null;
  };
}
