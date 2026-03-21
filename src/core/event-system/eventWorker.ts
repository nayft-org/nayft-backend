import { redis } from '../../config/redis';
import { eventService } from './event.service';
import { featureExists } from '../feature-system/featureValidator';
import { redisEventQueue, EVENT_QUEUE_KEY } from './redisEventQueue';
import type { EmitEventPayload } from './event.types';

const RETRY_DELAYS = [100, 500, 2000];
const MAX_RETRIES = 3;

async function persistWithRetry(
  payload: EmitEventPayload,
  invalidFeature: boolean
): Promise<void> {
  let lastError: Error | null = null;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await eventService.persistEvent(payload, invalidFeature);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
      }
    }
  }
  throw lastError;
}

async function processOne(): Promise<boolean> {
  const result = await redis.brpop(EVENT_QUEUE_KEY, 5);
  if (!result) return false;

  const [, raw] = result;
  let payload: EmitEventPayload;
  try {
    payload = JSON.parse(raw) as EmitEventPayload;
  } catch {
    console.error('[EventSystem] Invalid JSON in queue, skipping');
    return true;
  }

  const { featureKey } = payload;
  const exists = await featureExists(featureKey);
  const invalidFeature = !exists;
  if (invalidFeature) {
    console.warn(`[EventSystem] Invalid featureKey: ${featureKey}`);
  }

  const toPersist = { ...payload, metadata: payload.metadata || {} };
  try {
    await persistWithRetry(toPersist, invalidFeature);
  } catch {
    console.error(`[EventSystem] Failed to persist event after ${MAX_RETRIES} retries:`, payload);
    await redisEventQueue.pushToDlq(payload);
    console.log('[EventSystem] Moved to DLQ after retries');
  }
  return true;
}

export async function runEventWorker(): Promise<void> {
  console.log('[EventSystem] Event worker started');
  while (true) {
    try {
      const processed = await processOne();
      if (!processed) {
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      console.error('[EventSystem] Worker error:', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
