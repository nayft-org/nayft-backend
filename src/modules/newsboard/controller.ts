import { Response } from 'express';
import { newsBoardService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export const newsBoardController = {
  getBoards: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const boards = await newsBoardService.getBoards(req.userId!);
      sendSuccess(res, { boards });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  createBoard: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      const board = await newsBoardService.createBoard(req.userId!, name);
      sendSuccess(res, { board }, 201);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  saveItem: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { boardId } = req.params;
      const { newsId } = req.body;
      if (!newsId) {
        sendError(res, 'newsId is required', 400);
        return;
      }
      const result = await newsBoardService.saveItem(req.userId!, boardId, newsId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  getBoardNews: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { boardId } = req.params;
      const news = await newsBoardService.getBoardNews(req.userId!, boardId);
      sendSuccess(res, { news });
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },

  unsaveItem: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { boardId, newsId } = req.params;
      const result = await newsBoardService.unsaveItem(req.userId!, boardId, newsId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },
};
