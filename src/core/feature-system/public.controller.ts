import { Request, Response } from 'express';
import { featureService } from './feature.service';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * Public controller for frontend - returns active features only.
 * No admin auth required.
 */
export const featurePublicController = {
  getActive: async (_req: Request, res: Response): Promise<void> => {
    try {
      const features = await featureService.getAll({ isActive: true });
      const keys = features.map((f) => f.key);
      sendSuccess(res, { features: keys });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};
