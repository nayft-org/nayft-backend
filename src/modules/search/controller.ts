import { Request, Response } from 'express';
import { searchService } from './service';
import { sendSuccess, sendError } from '../../utils/response';

export const searchController = {
  search: async (req: Request, res: Response): Promise<void> => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length === 0) {
        sendError(res, 'Search query is required', 400);
        return;
      }

      const results = await searchService.search(query.trim());
      sendSuccess(res, results);
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};

