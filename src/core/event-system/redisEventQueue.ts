import { redis } from '../../config/redis';
import type { IEventQueue } from './eventQueue';
import type { EmitEventPayload } from './event.types';

const QUEUE_KEY = 'events:queue';
const DLQ_KEY = 'events:failed';

export const redisEventQueue: IEventQueue = {
  async push(payload: EmitEventPayload): Promise<void> {
    await redis.lpush(QUEUE_KEY, JSON.stringify(payload));
  },

  async pushToDlq(payload: EmitEventPayload): Promise<void> {
    await redis.lpush(DLQ_KEY, JSON.stringify(payload));
  },
};

export const EVENT_QUEUE_KEY = QUEUE_KEY;
export const EVENT_DLQ_KEY = DLQ_KEY;
