import { Request, Response } from 'express';
import { newsService } from './service';
import { coinService } from '../coin/service';
import { ingestionService } from './ingestion/service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { eventService } from '../../core/event-system';

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
      const news = await newsService.getAllNews(page, limit, categories, req.userId);
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
      const news = await newsService.getFollowingNews(req.userId!, page, limit, categories, mode);
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

  storeNews: async (req: Request, res: Response): Promise<void> => {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7927/ingest/46df119a-fef3-4d2e-b178-17829c05f667', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f20a21' },
        body: JSON.stringify({
          sessionId: 'f20a21',
          hypothesisId: 'H1',
          location: 'news/controller.ts:storeNews:entry',
          message: 'storeNews handler entered',
          data: {
            method: req.method,
            path: req.path,
            originalUrl: req.originalUrl,
            baseUrl: req.baseUrl,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const result = await ingestionService.storeNews();
      // #region agent log
      fetch('http://127.0.0.1:7927/ingest/46df119a-fef3-4d2e-b178-17829c05f667', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f20a21' },
        body: JSON.stringify({
          sessionId: 'f20a21',
          hypothesisId: 'H4',
          location: 'news/controller.ts:storeNews:afterIngest',
          message: 'ingestion finished',
          data: {
            fetched: result.fetched,
            stored: result.stored,
            skipped: result.skipped,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7927/ingest/46df119a-fef3-4d2e-b178-17829c05f667', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f20a21' },
          body: JSON.stringify({
            sessionId: 'f20a21',
            runId: 'post-fix',
            hypothesisId: 'H3',
            location: 'news/controller.ts:storeNews:emitResolved',
            message: 'emitEvent awaited OK',
            data: {},
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      } catch (err: any) {
        // #region agent log
        fetch('http://127.0.0.1:7927/ingest/46df119a-fef3-4d2e-b178-17829c05f667', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f20a21' },
          body: JSON.stringify({
            sessionId: 'f20a21',
            runId: 'post-fix',
            hypothesisId: 'H3',
            location: 'news/controller.ts:storeNews:emitRejected',
            message: 'emitEvent threw',
            data: { errName: err?.name, errMessage: String(err?.message || err) },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        console.error('[store-news] event emit failed', err);
        sendError(res, err?.message || 'Failed to record store-news event', 500);
        return;
      }
      sendSuccess(res, result);
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7927/ingest/46df119a-fef3-4d2e-b178-17829c05f667', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f20a21' },
        body: JSON.stringify({
          sessionId: 'f20a21',
          hypothesisId: 'H4',
          location: 'news/controller.ts:storeNews:catch',
          message: 'storeNews threw before emit',
          data: { errMessage: String(error?.message || error) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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

