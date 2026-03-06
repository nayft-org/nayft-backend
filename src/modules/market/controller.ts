import { Request, Response } from 'express';
import { marketService } from './service';
import { sendSuccess, sendError } from '../../utils/response';

export const marketController = {
  getTrending: async (req: Request, res: Response): Promise<void> => {
    try {
      const coins = await marketService.getTrending();
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getTopGainers: async (req: Request, res: Response): Promise<void> => {
    try {
      const coins = await marketService.getTopGainers();
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getTopLosers: async (req: Request, res: Response): Promise<void> => {
    try {
      const coins = await marketService.getTopLosers();
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getActiveCoins: async (req: Request, res: Response): Promise<void> => {
    try {
      const cursorParam = req.query.cursor;
      const limitParam = req.query.limit;
      const cursor = cursorParam !== undefined && cursorParam !== '' ? parseInt(String(cursorParam), 10) : undefined;
      const limit = limitParam !== undefined && limitParam !== '' ? parseInt(String(limitParam), 10) : 20;
      if (cursor !== undefined && (isNaN(cursor) || cursor < 0)) {
        sendError(res, 'Invalid cursor', 400);
        return;
      }
      if (isNaN(limit) || limit < 1 || limit > 50) {
        sendError(res, 'Limit must be between 1 and 50', 400);
        return;
      }
      const result = await marketService.getActiveCoinsPage(cursor, limit);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};

