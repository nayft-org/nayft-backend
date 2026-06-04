import { Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { onboardingService } from './service';

export const onboardingController = {
  complete: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coinIds } = req.body as { coinIds?: unknown };
      if (!Array.isArray(coinIds)) {
        sendError(res, 'coinIds must be an array', 400);
        return;
      }
      const user = await onboardingService.completeCoinOnboarding(req.userId!, coinIds);
      const userObj = user.toObject();
      delete (userObj as { passwordHash?: string }).passwordHash;
      sendSuccess(res, { user: userObj });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to complete onboarding';
      sendError(res, message, 400);
    }
  },
};
