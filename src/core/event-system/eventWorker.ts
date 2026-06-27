import {
  redisBlocking,
  isRedisShutdownRequested,
} from '../../config/redis';
import { eventService } from './event.service';
import { featureExists } from '../feature-system/featureValidator';
import { redisEventQueue, EVENT_QUEUE_KEY } from './redisEventQueue';
import type { EmitEventPayload } from './event.types';
import { validateIncomingClientEvent } from './eventValidation.service';
import { getRuntimeSwitchesSync } from '../runtime-config/runtimeConfig.service';
import { incrementComplianceMetric } from '../../observability/complianceMetrics';
import { emitEventSchema } from './event.schema';

function isConnectionClosedError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message === 'Connection is closed' ||
      err.message.includes('Connection is closed'))
  );
}

async function ensureBlockingRedisConnected(): Promise<void> {
  try {
    await redisBlocking.connect();
  } catch {
    // already connecting / connected, or shutdown in progress
  }
}

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

async function processOne(
  switches = getRuntimeSwitchesSync()
): Promise<boolean> {
  const result = await redisBlocking.brpop(EVENT_QUEUE_KEY, 5);
  if (!result) return false;

  const [, raw] = result;
  let payload: EmitEventPayload;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const schemaResult = emitEventSchema.safeParse(parsed);
    if (!schemaResult.success) {
      incrementComplianceMetric('invalidJsonQueueTotal');
      await redisEventQueue.pushToDlq({ raw, reason: 'invalid_schema' } as unknown as EmitEventPayload);
      return true;
    }
    payload = schemaResult.data;
  } catch {
    incrementComplianceMetric('invalidJsonQueueTotal');
    await redisEventQueue.pushToDlq({ raw } as unknown as EmitEventPayload);
    console.error('[EventSystem] Invalid JSON in queue, moved to DLQ');
    return true;
  }

  const validated = validateIncomingClientEvent(
    {
      featureKey: payload.featureKey,
      eventType: payload.eventType,
      userId: payload.userId,
      metadata: payload.metadata || {},
    },
    switches.events_schema_enforcement
  );

  if (!validated.accept) {
    incrementComplianceMetric('rejectedEventsTotal');
    await redisEventQueue.pushToDlq(payload);
    return true;
  }
  payload = validated.payload;

  const { featureKey } = payload;
  const isSystemEvent = featureKey.startsWith('system');
  let invalidFeature = false;
  if (!isSystemEvent) {
    const exists = await featureExists(featureKey);
    invalidFeature = !exists;
    if (invalidFeature) {
      console.warn(`[EventSystem] Invalid featureKey: ${featureKey}`);
    }
  }

  const toPersist = {
    ...payload,
    metadata: payload.metadata || {},
    preValidated: true,
  };
  try {
    await persistWithRetry(toPersist, invalidFeature);
    incrementComplianceMetric('eventsIngestAcceptedTotal');
    void maybeEnqueueInterestProfile(payload);
  } catch {
    console.error(`[EventSystem] Failed to persist event after ${MAX_RETRIES} retries:`, payload);
    await redisEventQueue.pushToDlq(payload);
    incrementComplianceMetric('dlqPushedTotal');
    console.error('[EventSystem] Moved to DLQ after retries');
  }
  return true;
}

const INTEREST_PROFILE_EVENTS = new Set([
  'news_feed:article_opened',
  'news_feed:source_clicked',
  'news_feed:source_viewed',
]);

async function maybeEnqueueInterestProfile(payload: EmitEventPayload): Promise<void> {
  if (!payload.userId || !INTEREST_PROFILE_EVENTS.has(payload.eventType)) return;
  try {
    const { enqueueInterestProfileRecompute } = await import(
      '../../modules/interest-profile/jobs/interestProfileWorker'
    );
    await enqueueInterestProfileRecompute(payload.userId);
  } catch {
    /* interest profile optional */
  }
}

export async function runEventWorker(): Promise<void> {
  await ensureBlockingRedisConnected();
  while (!isRedisShutdownRequested()) {
    try {
      const switches = getRuntimeSwitchesSync();
      const processed = await processOne(switches);
      if (!processed) continue;
    } catch (err) {
      if (isConnectionClosedError(err)) break;
      console.error('[EventWorker] Error:', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
