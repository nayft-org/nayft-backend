import { performance } from 'node:perf_hooks';
import { Request, Response } from 'express';
import { newsService } from './service';
import { coinService } from '../coin/service';
import { ingestionService } from './ingestion/service';
import { getNewsUpstreamLogContext } from '../../utils/coindesk';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { eventService } from '../../core/event-system';
import { buildNewsListKey, buildNewsFollowingKey } from '../../utils/responseCache';
import { serveNewsFeedResponse } from './newsFeedResponse';
import {
  translateNewsArticleDtos,
  translateSingleNewsArticle,
  type TranslatableNewsArticle,
} from '../../i18n/translateNews';

export const newsController = {
  getAllNews: async (req: AuthRequest, res: Response): Promise<void> => {
    const started = performance.now();
    try {
      const filterby = (req.query.filterby as string)?.toLowerCase();
      const coinid = req.query.coinid as string | undefined;

      if (filterby === 'coin' && coinid?.trim()) {
        const newsEn = await coinService.getCoinNews(coinid.trim());
        const news = await translateNewsArticleDtos(newsEn, req.resolvedLanguage);
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
      const lang = req.resolvedLanguage ?? 'en';

      await serveNewsFeedResponse({
        req,
        res,
        entityCacheKey: buildNewsListKey({ userScope, page, limit, categoriesSig }),
        metricsKind: 'news:list',
        lang,
        fetcher: () => newsService.getAllNews(page, limit, categories, req.userId),
        started,
      });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getFollowingNews: async (req: AuthRequest, res: Response): Promise<void> => {
    const started = performance.now();
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
      const lang = req.resolvedLanguage ?? 'en';

      await serveNewsFeedResponse({
        req,
        res,
        entityCacheKey: buildNewsFollowingKey({
          userId: req.userId!,
          page,
          limit,
          mode,
          categoriesSig,
        }),
        metricsKind: 'news:following',
        lang,
        fetcher: () => newsService.getFollowingNews(req.userId!, page, limit, categories, mode),
        started,
      });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getNewsDetail: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const newsEn = await newsService.getNewsDetail(newsId, req.userId);
      const news = await translateSingleNewsArticle(newsEn as TranslatableNewsArticle, req.resolvedLanguage);
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },

  storeNews: async (_req: Request, res: Response): Promise<void> => {
    const upstreamCtx = getNewsUpstreamLogContext();
    console.info('[store-news] POST /api/news/store-news', upstreamCtx);
    try {
      const result = await ingestionService.storeNews();
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
      console.info('[store-news] request done', { ...upstreamCtx, ...result });
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('[store-news] request failed', {
        ...upstreamCtx,
        status: error.response?.status,
        message: error.message,
      });
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
