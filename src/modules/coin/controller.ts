import { Request, Response } from 'express';
import { coinService } from './service';
import { sendSuccess, sendError } from '../../utils/response';

export const coinController = {
  getCoinProfile: async (req: Request, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const coin = await coinService.getCoinProfile(coinId);
      sendSuccess(res, { coin });
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },

  getCoinNews: async (req: Request, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const news = await coinService.getCoinNews(coinId);
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};

