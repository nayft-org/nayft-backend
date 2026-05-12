import { redis } from '../../config/redis';
import {
  NOTIF_STREAM_EVENTS,
  NOTIF_CONSUMER_GROUP,
} from './redisKeys';

/**
 * Append a normalized notification domain event to Redis Streams (durable ingress).
 */
export async function appendNotificationEvent(payloadJson: string): Promise<string> {
  const id = await redis.xadd(NOTIF_STREAM_EVENTS, '*', 'payload', payloadJson);
  return id ?? '';
}

export async function ensureNotificationConsumerGroup(): Promise<void> {
  try {
    await redis.xgroup('CREATE', NOTIF_STREAM_EVENTS, NOTIF_CONSUMER_GROUP, '0', 'MKSTREAM');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('BUSYGROUP')) {
      throw err;
    }
  }
}

export { NOTIF_STREAM_EVENTS, NOTIF_CONSUMER_GROUP };
