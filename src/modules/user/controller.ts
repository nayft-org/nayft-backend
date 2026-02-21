import { Response } from 'express';
import { userService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export const userController = {
  toggleFollowCoin: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const result = await userService.toggleFollowCoin(req.userId!, coinId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  searchUsers: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const q = req.query.q as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);
      const users = await userService.searchUsers(q, limit);
      sendSuccess(res, { users });
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },
};

