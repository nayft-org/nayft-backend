import { redis } from '../../config/redis';

export const NEWS_FEED_CHANNEL = 'news:feed';

export interface NewsInsertedMessage {
  channel: 'news';
  type: 'news:new';
  inserted: number;
  emittedAt: string;
}

/**
 * Broadcasts a lightweight "new news available" event.
 * Clients should refetch feed data to apply all server-side filters.
 */
export async function publishNewsInserted(inserted: number): Promise<void> {
  if (!Number.isFinite(inserted) || inserted <= 0) return;

  const message: NewsInsertedMessage = {
    channel: 'news',
    type: 'news:new',
    inserted,
    emittedAt: new Date().toISOString(),
  };

  await redis.publish(NEWS_FEED_CHANNEL, JSON.stringify(message));
}
