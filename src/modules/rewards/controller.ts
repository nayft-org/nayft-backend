import { Response } from 'express';
import { rewardsService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export const rewardsController = {
  getRewards: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const rewards = await rewardsService.getRewards(req.userId!);
      sendSuccess(res, rewards);
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  claimReward: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { action } = req.body;
      if (!action) {
        sendError(res, 'Action is required', 400);
        return;
      }

      const result = await rewardsService.claimReward(req.userId!, action);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },
};

