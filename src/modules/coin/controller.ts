import { Request, Response } from 'express';
import { coinService } from './service';
import { ingestionService } from './ingestion/service';
import { sendSuccess, sendError } from '../../utils/response';

export const coinController = {
  getCoinsBatch: async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.query.ids as string | undefined;
      if (!raw?.trim()) {
        sendSuccess(res, { coins: [] });
        return;
      }
      const ids = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const coins = await coinService.getCoinsByIds(ids);
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message ?? 'Batch fetch failed', 500);
    }
  },

  createCollections: async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await ingestionService.ingestFromAllProviders();
      sendSuccess(res, {
        success: result.success,
        providers: result.providers,
        filtered_coins_count: result.filtered_coins_count,
        coinmasters_upserted: result.coinmasters_upserted,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error: any) {
      sendError(res, error.message ?? 'Ingestion failed', 500);
    }
  },

  populateLabeledCoins: async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await coinService.populateLabeledCoins();
      sendSuccess(res, { count: result.count, success: result.success });
    } catch (error: any) {
      sendError(res, error.message ?? 'Populate labeled coins failed', 500);
    }
  },

  populateLabeledActiveCoins: async (req: Request, res: Response): Promise<void> => {
    try {
      const pageParam = req.query.page;
      if (pageParam === undefined || pageParam === '') {
        sendError(res, 'Query param "page" is required (1-35)', 400);
        return;
      }
      const page = parseInt(String(pageParam), 10);
      if (isNaN(page) || page < 1 || page > 35) {
        sendError(res, 'Page must be a number between 1 and 35', 400);
        return;
      }
      const result = await coinService.populateLabeledActiveCoins(page);
      sendSuccess(res, { count: result.count, success: result.success, page: result.page });
    } catch (error: any) {
      sendError(res, error.message ?? 'Populate active coins failed', 500);
    }
  },

  populateCmcLabeledCoins: async (req: Request, res: Response): Promise<void> => {
    try {
      const startParam = req.query.start;
      if (startParam === undefined || startParam === '') {
        sendError(res, 'Query param "start" is required (1-8701)', 400);
        return;
      }
      const start = parseInt(String(startParam), 10);
      if (isNaN(start) || start < 1 || start > 8701) {
        sendError(res, 'Start must be a number between 1 and 8701', 400);
        return;
      }
      const result = await coinService.populateCmcLabeledCoins(start);
      sendSuccess(res, { count: result.count, success: result.success, start: result.start });
    } catch (error: any) {
      sendError(res, error.message ?? 'Populate CMC labeled coins failed', 500);
    }
  },

  getCoinStats: async (req: Request, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const stats = await coinService.getCoinStats(coinId);
      if (!stats) {
        sendError(res, 'Stats not found for this coin', 404);
        return;
      }
      sendSuccess(res, { stats });
    } catch (error: any) {
      sendError(res, error.message ?? 'Failed to fetch coin stats', 500);
    }
  },

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

