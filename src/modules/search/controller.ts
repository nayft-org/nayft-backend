import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { searchService, SearchSegment } from './service';

const parseLimit = (value: unknown): number => {
  const parsed = parseInt(String(value || '8'), 10);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(parsed, 25));
};

const parseSegments = (value: unknown): SearchSegment[] => {
  const raw = String(value || 'all')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const valid = new Set<SearchSegment>([
    'all',
    'coins',
    'news',
    'users',
    'newsBoards',
    'portfolioAssets',
  ]);

  const segments = raw.filter((segment): segment is SearchSegment => valid.has(segment as SearchSegment));
  return segments.length > 0 ? segments : ['all'];
};

export const searchController = {
  search: async (req: Request, res: Response): Promise<void> => {
    try {
      const query = String(req.query.q || '').trim();
      if (!query) {
        sendError(res, 'Search query is required', 400);
        return;
      }

      const limit = parseLimit(req.query.limit);
      const segments = parseSegments(req.query.segments);
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
      const userId = (req as any).userId as string | undefined;

      const result = await searchService.search({
        query,
        segments,
        limit,
        cursor,
        userId,
      });

      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message || 'Search failed', 500);
    }
  },
};
