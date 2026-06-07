import WebSocket from 'ws';
import { redis } from '../config/redis';
import { NEWS_FEED_CHANNEL, type NewsFeedChangedMessage } from '../modules/news/realtime';

const newsClients = new Set<WebSocket>();
let subscriberStarted = false;

export function registerNewsClient(ws: WebSocket): void {
  newsClients.add(ws);
}

export function unregisterNewsClient(ws: WebSocket): void {
  newsClients.delete(ws);
}

function broadcastNewsToLocalClients(message: NewsFeedChangedMessage): void {
  const payload = JSON.stringify(message);
  for (const ws of newsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function startNewsRedisFanout(): void {
  if (subscriberStarted) return;
  subscriberStarted = true;

  const sub = redis.duplicate();
  sub.on('message', (_channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message) as NewsFeedChangedMessage;
      if (parsed?.type !== 'news:new') return;
      broadcastNewsToLocalClients(parsed);
    } catch {
      /* ignore malformed payload */
    }
  });

  sub.subscribe(NEWS_FEED_CHANNEL, (err) => {
    if (err) {
      console.error('[NewsFanout] SUBSCRIBE failed:', err);
    } else {
      console.log(`[NewsFanout] Subscribed to ${NEWS_FEED_CHANNEL}`);
    }
  });
}
