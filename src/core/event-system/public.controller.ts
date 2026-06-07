import { Response } from 'express';
import { eventService } from './event.service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { emitEventSchema } from './event.schema';
import { redisEventQueue } from './redisEventQueue';
import { getRuntimeSwitchesSync } from '../runtime-config/runtimeConfig.service';
import { validateIncomingClientEvent } from './eventValidation.service';
import { incrementComplianceMetric } from '../../observability/complianceMetrics';

/**
 * Public controller for frontend event tracking.
 * Accepts featureKey, eventType, metadata. Uses userId if authenticated.
 * Pushes to Redis queue; falls back to direct write if Redis unavailable.
 */
export const eventPublicController = {
  track: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const switches = getRuntimeSwitchesSync();

      if (!switches.events_ingest_enabled || !switches.client_analytics_server_accept) {
        incrementComplianceMetric('eventsIngestDisabledTotal');
        sendError(res, 'Event ingestion temporarily unavailable', 503);
        return;
      }

      const parsed = emitEventSchema.safeParse({
        ...req.body,
        userId: req.userId,
      });
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || 'Invalid request body';
        incrementComplianceMetric('rejectedEventsTotal');
        sendError(res, msg, 400);
        return;
      }

      const { featureKey, eventType, userId, metadata = {} } = parsed.data;

      const validated = validateIncomingClientEvent(
        { featureKey, eventType, userId, metadata },
        switches.events_schema_enforcement
      );

      if (!validated.accept) {
        incrementComplianceMetric('rejectedEventsTotal');
        sendError(res, validated.reason || 'Invalid event', 422);
        return;
      }

      const payload = validated.payload;

      try {
        await redisEventQueue.push(payload);
        incrementComplianceMetric('eventsIngestQueuedTotal');
      } catch {
        await eventService.emitEvent(payload);
        incrementComplianceMetric('eventsIngestAcceptedTotal');
      }

      sendSuccess(res, { ok: true });
    } catch (error: unknown) {
      sendError(res, error instanceof Error ? error.message : 'Internal error', 500);
    }
  },
};
