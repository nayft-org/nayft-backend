import { Request, Response } from 'express';
import { featureService } from './feature.service';
import { sendSuccess, sendError } from '../../utils/response';
import { patchFeatureSchema } from './feature.schema';

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

  patch: async (req: Request, res: Response): Promise<void> => {
    try {
      const key = req.params.key as string;
      const updatedBy = (req.headers['x-admin-id'] as string) || undefined;

      if (!key || key.trim() === '') {
        sendError(res, 'Feature key is required', 400);
        return;
      }

      const parsed = patchFeatureSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || 'Invalid request body';
        sendError(res, msg, 400);
        return;
      }

      const feature = await featureService.updateSafeFields(key, parsed.data, updatedBy);
      sendSuccess(res, { feature });
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('not found')) sendError(res, msg, 404);
      else if (msg.includes('not controllable')) sendError(res, msg, 400);
      else if (msg.includes('Conflict')) sendError(res, msg, 409);
      else sendError(res, msg, 500);
    }
  },
};
