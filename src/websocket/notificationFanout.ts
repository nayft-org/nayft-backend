import WebSocket from 'ws';
import { redis } from '../config/redis';
import { NOTIFY_USER_PATTERN } from '../services/notificationEngine/redisKeys';

const clientsByUser = new Map<string, Set<WebSocket>>();

let subscriberStarted = false;

export function registerNotifyClient(ws: WebSocket, userId: string): void {
  let set = clientsByUser.get(userId);
  if (!set) {
    set = new Set();
    clientsByUser.set(userId, set);
  }
  set.add(ws);
}

export function unregisterNotifyClient(ws: WebSocket, userId: string): void {
  const set = clientsByUser.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) clientsByUser.delete(userId);
}

/** Close all local WS connections for a user (e.g. after account deletion). */
export function disconnectNotifyClientsForUser(userId: string): void {
  const set = clientsByUser.get(userId);
  if (!set) return;
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Account deleted');
    }
  }
  clientsByUser.delete(userId);
}

/** Push to every connected WS for this user (local process). */
export function broadcastNotifyToLocalClients(userId: string, message: unknown): void {
  const set = clientsByUser.get(userId);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(message);
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Each API process subscribes to `notify:user:*` and forwards Redis messages to local WS clients.
 */
export function startNotificationRedisFanout(): void {
  if (subscriberStarted) return;
  subscriberStarted = true;

  const sub = redis.duplicate();
  sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
    const parts = channel.split(':');
    if (parts.length < 3 || parts[0] !== 'notify' || parts[1] !== 'user') return;
    const userId = parts.slice(2).join(':'); // tolerate unusual ids
    try {
      const parsed = JSON.parse(message) as unknown;
      broadcastNotifyToLocalClients(userId, parsed);
    } catch {
      /* ignore */
    }
  });

  void sub
    .psubscribe(NOTIFY_USER_PATTERN)
    .then(() => {
      console.log(`[NotificationsFanout] PSUBSCRIBE ${NOTIFY_USER_PATTERN}`);
    })
    .catch((err: unknown) => {
      console.error('[NotificationsFanout] PSUBSCRIBE failed:', err);
    });
}
