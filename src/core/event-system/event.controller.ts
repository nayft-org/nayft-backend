import { Request, Response } from 'express';
import { eventService } from './event.service';
import { sendSuccess, sendError } from '../../utils/response';

export const eventController = {
  getByFeature: async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureKey } = req.params;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const events = await eventService.getEventsByFeature(featureKey, { from, to, limit });
      sendSuccess(res, { featureKey, events });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getTrends: async (req: Request, res: Response): Promise<void> => {
    try {
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const featureKey = req.query.featureKey as string | undefined;

      const trends = await eventService.getEventTrends({ from, to, featureKey });
      sendSuccess(res, { trends });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};
