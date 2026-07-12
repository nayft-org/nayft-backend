import { Response } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { AuthRequest } from '../../types';
import { searchService, SearchSegment } from './service';
import { translateUnifiedSearchResponse } from '../../i18n/translateSearch';

const MIN_QUERY_LEN = 2;
const MAX_QUERY_LEN = 100;

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
  search: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const query = String(req.query.q || '').trim().normalize('NFKC').replace(/\s+/g, ' ');
      if (!query) {
        sendError(res, 'Search query is required', 400);
        return;
      }
      if (query.length < MIN_QUERY_LEN) {
        sendError(res, `Search query must be at least ${MIN_QUERY_LEN} characters`, 400);
        return;
      }
      if (query.length > MAX_QUERY_LEN) {
        sendError(res, `Search query must be at most ${MAX_QUERY_LEN} characters`, 400);
        return;
      }

      const limit = parseLimit(req.query.limit);
      const segments = parseSegments(req.query.segments);
      const userId = req.userId;

      const result = await searchService.search({
        query,
        segments,
        limit,
        userId,
      });

      const out = await translateUnifiedSearchResponse(result, req.resolvedLanguage);
      sendSuccess(res, out);
    } catch (error: any) {
      sendError(res, error.message || 'Search failed', 500);
    }
  },
};
