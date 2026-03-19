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
};
