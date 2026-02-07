import { Request, Response } from 'express';
import { newsService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export const newsController = {
  getAllNews: async (req: Request, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const news = await newsService.getAllNews(page, limit);
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getFollowingNews: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const news = await newsService.getFollowingNews(req.userId!, page, limit);
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getNewsDetail: async (req: Request, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const news = await newsService.getNewsDetail(newsId);
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },
};

