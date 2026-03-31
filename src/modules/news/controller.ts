import { Request, Response } from 'express';
import { newsService } from './service';
import { coinService } from '../coin/service';
import { ingestionService } from './ingestion/service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { eventService } from '../../core/event-system';
import { withResponseCache, buildNewsListKey, buildNewsFollowingKey } from '../../utils/responseCache';

export const newsController = {
  getAllNews: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const filterby = (req.query.filterby as string)?.toLowerCase();
      const coinid = req.query.coinid as string | undefined;

      if (filterby === 'coin' && coinid?.trim()) {
        const news = await coinService.getCoinNews(coinid.trim());
        sendSuccess(res, { news });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const categoriesParam = (req.query.categories || req.query.category) as string | undefined;
      const categories = categoriesParam
        ? categoriesParam
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : [];
      const categoriesSig = categories.length ? [...categories].sort().join(',') : 'all';
      const userScope = req.userId ?? 'anon';
      const { data: news } = await withResponseCache({
        cacheKey: buildNewsListKey({ userScope, page, limit, categoriesSig }),
        ttlSeconds: 45,
        metricsKind: 'news:list',
        fetcher: () => newsService.getAllNews(page, limit, categories, req.userId),
      });
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getFollowingNews: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const modeParam = (req.query.mode as string | undefined)?.toLowerCase();
      const mode: 'all' | 'coin' | 'users' =
        modeParam === 'coin' || modeParam === 'users' ? modeParam : 'all';
      const categoriesParam = (req.query.categories || req.query.category) as string | undefined;
      const categories = categoriesParam
        ? categoriesParam
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : [];
      const categoriesSig = categories.length ? [...categories].sort().join(',') : 'all';
      const { data: news } = await withResponseCache({
        cacheKey: buildNewsFollowingKey({
          userId: req.userId!,
          page,
          limit,
          mode,
          categoriesSig,
        }),
        ttlSeconds: 45,
        metricsKind: 'news:following',
        fetcher: () => newsService.getFollowingNews(req.userId!, page, limit, categories, mode),
      });
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getNewsDetail: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const news = await newsService.getNewsDetail(newsId, req.userId);
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },

  storeNews: async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await ingestionService.storeNews();
      // Registered feature key (see feature_registry); avoids invalidFeature and ensures trends match admin filters.
      try {
        await eventService.emitEvent({
          featureKey: 'news_feed',
          eventType: 'store_news_run',
          metadata: {
            fetched: result.fetched,
            stored: result.stored,
            skipped: result.skipped,
            inserted: result.inserted,
            updated: result.updated,
          },
        });
      } catch (err: any) {
        console.error('[store-news] event emit failed', err);
        sendError(res, err?.message || 'Failed to record store-news event', 500);
        return;
      }
      sendSuccess(res, result);
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.response?.data?.errmsg ||
        error.message ||
        'Failed to store news';
      const status = error.response?.status || 500;
      sendError(res, message, status);
    }
  },
};

