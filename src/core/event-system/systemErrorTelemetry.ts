import type { Request } from 'express';
import { SystemEvent } from '../event-system/event.model';
import { hashRoute, validateServerEvent } from '../event-system/eventValidation.service';
import { getRuntimeSwitchesSync } from '../runtime-config/runtimeConfig.service';
import { config } from '../../config/env';

const SAMPLE_RATE =
  process.env.SYSTEM_ERROR_SAMPLE_RATE != null
    ? Number(process.env.SYSTEM_ERROR_SAMPLE_RATE)
    : config.perfLogSampleRate;

function shouldSample(): boolean {
  if (config.nodeEnv !== 'production') return true;
  return Math.random() < SAMPLE_RATE;
}

/** Fast-path api_error telemetry — skips featureExists and full emitEvent chain. */
export async function emitSampledSystemError(req: Request): Promise<void> {
  if (!shouldSample()) return;

  const switches = getRuntimeSwitchesSync();
  const metadata = {
    routeHash: hashRoute(req.path),
    errorCode: 'internal_error' as const,
    method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS',
  };

  const validated = validateServerEvent(
    {
      featureKey: 'system',
      eventType: 'api_error',
      userId: (req as { userId?: string }).userId,
      metadata,
    },
    switches.events_schema_enforcement
  );

  if (!validated.accept) return;

  void SystemEvent.create({
    featureKey: 'system',
    eventType: 'api_error',
    userId: validated.payload.userId,
    metadata: validated.payload.metadata,
    timestamp: new Date(),
    invalidFeature: false,
  }).catch(() => {});
}
