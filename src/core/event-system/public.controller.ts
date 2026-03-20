import { Response } from 'express';
import { eventService } from './event.service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { emitEventSchema } from './event.schema';
import { redisEventQueue } from './redisEventQueue';

/**
 * Public controller for frontend event tracking.
 * Accepts featureKey, eventType, metadata. Uses userId if authenticated.
 * Pushes to Redis queue; falls back to direct write if Redis unavailable.
 */
export const eventPublicController = {
  track: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = emitEventSchema.safeParse({
        ...req.body,
        userId: req.userId,
      });
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || 'Invalid request body';
        sendError(res, msg, 400);
        return;
      }

      const { featureKey, eventType, userId, metadata } = parsed.data;

      try {
        await redisEventQueue.push({
          featureKey,
          eventType,
          userId,
          metadata,
        });
      } catch {
        await eventService.emitEvent({
          featureKey,
          eventType,
          userId,
          metadata,
        });
      }

      sendSuccess(res, { ok: true });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};
