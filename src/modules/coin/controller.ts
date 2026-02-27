import { Request, Response } from 'express';
import { coinService } from './service';
import { ingestionService } from './ingestion/service';
import { sendSuccess, sendError } from '../../utils/response';

export const coinController = {
  createCollections: async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await ingestionService.ingestFromAllProviders();
      sendSuccess(res, {
        success: result.success,
        providers: result.providers,
        filtered_coins_count: result.filtered_coins_count,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error: any) {
      sendError(res, error.message ?? 'Ingestion failed', 500);
    }
  },

  getCoinProfile: async (req: Request, res: Response): Promise<void> => {
    console.log("coinController.getCoinProfile", req.params);
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

