import { Response } from 'express';
import { userService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export const userController = {
  getPreferences: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = await userService.getPreferences(req.userId!);
      sendSuccess(res, data);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  updatePreferences: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = req.body as { preferredLanguage?: string; personalizationEnabled?: boolean };
      if (body.preferredLanguage === undefined && body.personalizationEnabled === undefined) {
        sendError(res, 'No preferences to update', 400);
        return;
      }
      const data = await userService.updatePreferences(req.userId!, body);
      sendSuccess(res, data);
    } catch (error: unknown) {
      sendError(res, error instanceof Error ? error.message : 'Update failed', 400);
    }
  },

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

  deleteMe: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await userService.deleteAccount(req.userId!);
      sendSuccess(res, result);
    } catch (error: any) {
      const message = error?.message ?? 'Failed to delete account';
      const status = message === 'User not found' ? 404 : 500;
      sendError(res, message, status);
    }
  },
};

