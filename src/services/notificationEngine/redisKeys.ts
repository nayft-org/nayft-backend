/** Redis key patterns for notification subsystem (RFC-aligned). */

export const NOTIF_STREAM_EVENTS = 'notif:stream:events';
export const NOTIF_STREAM_DLQ = 'notif:stream:dlq';
export const NOTIF_STREAM_POISON = 'notif:stream:poison';

export const NOTIF_CONSUMER_GROUP = 'notif-processors';
export const NOTIF_CONSUMER_NAME_PREFIX = 'worker';

/** Pub/sub channel per user for WS fanout */
export function notifyUserChannel(userId: string): string {
  return `notify:user:${userId}`;
}

/** PSUBSCRIBE pattern for gateways */
export const NOTIFY_USER_PATTERN = 'notify:user:*';

export function notifSeqKey(userId: string): string {
  return `notif:seq:${userId}`;
}

export function notifUnreadKey(userId: string): string {
  return `notif:unread:${userId}`;
}

export function notifDedupeKey(userId: string, hash: string): string {
  return `notif:dedupe:${userId}:${hash}`;
}

export function notifThrottleKey(userId: string, policy: string): string {
  return `notif:throttle:${userId}:${policy}`;
}
