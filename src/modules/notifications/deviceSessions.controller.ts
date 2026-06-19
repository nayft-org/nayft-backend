import { Response } from 'express';
import { AuthRequest } from '../../types';
import { sendError, sendSuccess } from '../../utils/response';
import { deviceSessionsService } from './deviceSessions.service';

export const deviceSessionsController = {
  upsert: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = req.body ?? {};
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
      const platform = typeof body.platform === 'string' ? body.platform : '';
      const pushToken = typeof body.pushToken === 'string' ? body.pushToken : '';
      if (!deviceId || !pushToken) {
        sendError(res, 'deviceId and pushToken are required', 400);
        return;
      }
      if (platform !== 'ios' && platform !== 'android') {
        sendError(res, 'platform must be ios or android', 400);
        return;
      }
      const result = await deviceSessionsService.upsert(req.userId!, {
        deviceId,
        platform,
        pushToken,
      });
      sendSuccess(res, result);
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },

  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await deviceSessionsService.remove(req.userId!, req.params.deviceId);
      sendSuccess(res, result);
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },
};
