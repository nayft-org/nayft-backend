import { Request, Response } from 'express';
import { planService } from './plan.service';
import { sendSuccess, sendError } from '../utils/response';

export const planController = {
  getAll: async (_req: Request, res: Response): Promise<void> => {
    try {
      const plans = await planService.getAll();
      sendSuccess(res, { plans });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch plans';
      sendError(res, message, 500);
    }
  },
};
