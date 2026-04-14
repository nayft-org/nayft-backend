import { Request, Response } from 'express';
import { marketService } from './service';
import { snapshotService } from './snapshot.service';
import { sendSuccess, sendError } from '../../utils/response';

function normalizeIfNoneMatch(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t.startsWith('W/')) return null;
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

export const marketController = {
  /**
   * Phase 1: precomputed market snapshot (Redis only).
   * Supports If-None-Match → 304 when etag matches.
   */
  getSnapshot: async (req: Request, res: Response): Promise<void> => {
    try {
      const snapshot = await snapshotService.getSnapshot();
      if (!snapshot) {
        res.setHeader('Retry-After', '5');
        sendError(res, 'Market snapshot not ready yet', 503);
        return;
      }

      const clientEtag = normalizeIfNoneMatch(req.headers['if-none-match']);
      if (clientEtag && clientEtag === snapshot.etag) {
        res.status(304).end();
        return;
      }

      res.setHeader('ETag', `"${snapshot.etag}"`);
      res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
      sendSuccess(res, snapshot);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Snapshot error';
      sendError(res, message, 500);
    }
  },

  getTrending: async (_req: Request, res: Response): Promise<void> => {
    try {
      const coins = await marketService.getTrending();
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getTopGainers: async (_req: Request, res: Response): Promise<void> => {
    try {
      const coins = await marketService.getTopGainers();
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getTopLosers: async (_req: Request, res: Response): Promise<void> => {
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

