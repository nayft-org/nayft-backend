import { Request, Response } from 'express';
import { coinService } from './service';
import { ingestionService } from './ingestion/service';
import { sendSuccess, sendError } from '../../utils/response';
import {
  withResponseCache,
  buildCoinProfileKey,
  buildCoinStatsKey,
  buildCoinNewsKey,
} from '../../utils/responseCache';

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
        exchange_listed_assets_count: result.filtered_coins_count,
        coin_news_tagging_map_upserted: result.coinmasters_upserted,
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
    const { coinId } = req.params;
    const t = Date.now();
    try {
      // ROLLBACK: remove withResponseCache wrapper + buildCoinStatsKey call to revert
      // to direct service call with no caching
      const { data: stats } = await withResponseCache({
        cacheKey: buildCoinStatsKey(coinId),
        ttlSeconds: 45,
        metricsKind: 'coin:stats',
        fetcher: async () => {
          const s = await coinService.getCoinStats(coinId);
          if (!s) {
            const err = new Error('Stats not found for this coin') as Error & { statusCode?: number };
            err.statusCode = 404;
            throw err;
          }
          return s;
        },
      });
      sendSuccess(res, { stats });
    } catch (error: any) {
      const code = error?.statusCode === 404 ? 404 : 500;
      sendError(res, error.message ?? 'Failed to fetch coin stats', code);
    } finally {
      console.log('[perf] getCoinStats resolved in', Date.now() - t, 'ms');
    }
  },

  getCoinProfile: async (req: Request, res: Response): Promise<void> => {
    const { coinId } = req.params;
    const t = Date.now();
    try {
      // ROLLBACK: remove withResponseCache wrapper + buildCoinProfileKey call to revert
      // to direct service call with no caching
      const { data: coin } = await withResponseCache({
        cacheKey: buildCoinProfileKey(coinId),
        ttlSeconds: 45,
        metricsKind: 'coin:profile',
        fetcher: () => coinService.getCoinProfile(coinId),
      });
      sendSuccess(res, { coin });
    } catch (error: any) {
      sendError(res, error.message, 404);
    } finally {
      console.log('[perf] getCoinProfile resolved in', Date.now() - t, 'ms');
    }
  },

  getCoinNews: async (req: Request, res: Response): Promise<void> => {
    const { coinId } = req.params;
    const t = Date.now();
    try {
      // ROLLBACK: remove withResponseCache wrapper + buildCoinNewsKey call to revert
      // to direct service call with no caching
      const { data: news } = await withResponseCache({
        cacheKey: buildCoinNewsKey(coinId),
        ttlSeconds: 105,
        metricsKind: 'coin:news',
        fetcher: () => coinService.getCoinNews(coinId),
      });
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 500);
    } finally {
      console.log('[perf] getCoinNews resolved in', Date.now() - t, 'ms');
    }
  },
};

