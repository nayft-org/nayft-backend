import { redis, redisBlocking } from '../config/redis';
import {
  NOTIF_STREAM_EVENTS,
  NOTIF_CONSUMER_GROUP,
  ensureNotificationConsumerGroup,
} from '../services/notificationEngine/notificationEventBus';
import { NOTIF_STREAM_DLQ } from '../services/notificationEngine/redisKeys';
import { processNotificationDomainEvent } from '../services/notificationEngine/NotificationProcessor';
import { notifMetrics } from '../observability/notifMetrics';
import { randomBytes } from 'crypto';

function pairsFromFields(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    out[fields[i]] = fields[i + 1];
  }
  return out;
}

type StreamMsg = [id: string, fields: string[]];
type StreamReadResult = [name: string, messages: StreamMsg[]][] | null;

const WORKER_NAME = `notif-${process.pid}-${randomBytes(4).toString('hex')}`;

export async function runNotificationStreamWorker(): Promise<void> {
  await ensureNotificationConsumerGroup();
  console.log('[NotificationStreamWorker] started', WORKER_NAME);

  for (;;) {
    try {
      const raw = (await redisBlocking.call(
        'XREADGROUP',
        'GROUP',
        NOTIF_CONSUMER_GROUP,
        WORKER_NAME,
        'BLOCK',
        '8000',
        'COUNT',
        '50',
        'STREAMS',
        NOTIF_STREAM_EVENTS,
        '>'
      )) as StreamReadResult | null;

      if (!raw) continue;

      for (const [, messages] of raw) {
        for (const [id, fieldList] of messages) {
          const kv = pairsFromFields(fieldList);
          const payloadJson = kv.payload;
          if (!payloadJson) {
            await redis.xadd(NOTIF_STREAM_DLQ, '*', 'reason', 'missing_payload', 'original_id', id);
            await redis.xack(NOTIF_STREAM_EVENTS, NOTIF_CONSUMER_GROUP, id);
            continue;
          }
          try {
            const parsed = JSON.parse(payloadJson) as unknown;
            await processNotificationDomainEvent(parsed);
            notifMetrics.streamProcessedTotal += 1;
          } catch (err) {
            console.error('[NotificationStreamWorker] process failed', err);
            await redis.xadd(
              NOTIF_STREAM_DLQ,
              '*',
              'reason',
              'process_error',
              'original_id',
              id,
              'payload',
              payloadJson.slice(0, 8000)
            );
          } finally {
            await redis.xack(NOTIF_STREAM_EVENTS, NOTIF_CONSUMER_GROUP, id);
            notifMetrics.streamAckTotal += 1;
          }
        }
      }
    } catch (err) {
      console.error('[NotificationStreamWorker] loop error', err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
