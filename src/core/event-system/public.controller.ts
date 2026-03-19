import { Response } from 'express';
import { validationResult } from 'express-validator';
import { eventService } from './event.service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

/**
 * Public controller for frontend event tracking.
 * Accepts featureKey, eventType, metadata. Uses userId if authenticated.
 */
export const eventPublicController = {
  track: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, errors.array()[0].msg, 400);
        return;
      }

      const { featureKey, eventType, metadata = {} } = req.body;

      await eventService.emitEvent({
        featureKey,
        eventType,
        userId: req.userId,
        metadata,
      });

      sendSuccess(res, { ok: true });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};
