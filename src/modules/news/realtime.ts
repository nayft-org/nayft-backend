import { redis } from '../../config/redis';
import { bumpNewsFeedRevision } from './newsFeedRevision';

export const NEWS_FEED_CHANNEL = 'news:feed';

export interface NewsFeedChangedMessage {
  channel: 'news';
  type: 'news:new';
  inserted: number;
  updated: number;
  emittedAt: string;
}

/** @deprecated Use NewsFeedChangedMessage */
export type NewsInsertedMessage = NewsFeedChangedMessage;

/**
 * Broadcasts a lightweight "news feed changed" event over Redis pub/sub.
 * Clients should refetch feed data to apply all server-side filters.
 */
export async function publishNewsFeedChanged(counts: {
  inserted?: number;
  updated?: number;
}): Promise<void> {
  const inserted = Math.max(0, counts.inserted ?? 0);
  const updated = Math.max(0, counts.updated ?? 0);
  if (inserted + updated <= 0) return;

  const message: NewsFeedChangedMessage = {
    channel: 'news',
    type: 'news:new',
    inserted,
    updated,
    emittedAt: new Date().toISOString(),
  };

  await redis.publish(NEWS_FEED_CHANNEL, JSON.stringify(message));
}

/** Bump revision + publish so HTTP ETag caches and WS clients both invalidate. */
export async function notifyNewsFeedChanged(counts: {
  inserted?: number;
  updated?: number;
}): Promise<void> {
  const inserted = Math.max(0, counts.inserted ?? 0);
  const updated = Math.max(0, counts.updated ?? 0);
  if (inserted + updated <= 0) return;

  await bumpNewsFeedRevision().catch((err) => {
    console.error('[news-realtime] feed revision bump failed:', err);
  });
  await publishNewsFeedChanged({ inserted, updated }).catch((err) => {
    console.error('[news-realtime] publish failed:', err);
  });
}

let debouncedNotifyTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesce rapid DB updates (e.g. sentiment worker batch) into one client refresh. */
export function scheduleNewsFeedChanged(): void {
  if (debouncedNotifyTimer) return;
  debouncedNotifyTimer = setTimeout(() => {
    debouncedNotifyTimer = null;
    void notifyNewsFeedChanged({ updated: 1 });
  }, 400);
}

/** @deprecated Use publishNewsFeedChanged or notifyNewsFeedChanged */
export async function publishNewsInserted(inserted: number): Promise<void> {
  await publishNewsFeedChanged({ inserted });
}
