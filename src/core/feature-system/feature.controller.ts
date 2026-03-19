import { Request, Response } from 'express';
import { featureService } from './feature.service';
import { sendSuccess, sendError } from '../../utils/response';

export const featureController = {
  getAll: async (req: Request, res: Response): Promise<void> => {
    try {
      const module = req.query.module as string | undefined;
      const isActiveParam = req.query.isActive as string | undefined;
      const category = req.query.category as 'free' | 'premium' | 'enterprise' | undefined;

      const isActive =
        isActiveParam === undefined
          ? undefined
          : isActiveParam === 'true' || isActiveParam === '1';

      const features = await featureService.getAll({
        module: module || undefined,
        isActive,
        category,
      });
      sendSuccess(res, { features });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  patchIsActive: async (req: Request, res: Response): Promise<void> => {
    try {
      const key = req.params.key as string;
      const isActive = req.body?.isActive;

      if (!key || key.trim() === '') {
        sendError(res, 'Feature key is required', 400);
        return;
      }
      if (typeof isActive !== 'boolean') {
        sendError(res, 'isActive must be a boolean', 400);
        return;
      }

      const feature = await featureService.updateIsActive(key, isActive);
      sendSuccess(res, { feature });
    } catch (error: any) {
      sendError(res, error.message, error.message?.includes('not found') ? 404 : 500);
    }
  },

  delete: async (req: Request, res: Response): Promise<void> => {
    try {
      const key = req.params.key as string;

      if (!key || key.trim() === '') {
        sendError(res, 'Feature key is required', 400);
        return;
      }

      await featureService.delete(key);
      sendSuccess(res, { deleted: key });
    } catch (error: any) {
      sendError(res, error.message, error.message?.includes('not found') ? 404 : 500);
    }
  },
};
