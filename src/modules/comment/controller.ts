import { Response } from 'express';
import { commentService } from './service';
import { translateCommentDtos } from '../../i18n/translateComments';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export const commentController = {
  getComments: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const commentsEn = await commentService.getComments(newsId, page, limit);
      const comments = await translateCommentDtos(commentsEn, req.resolvedLanguage);
      sendSuccess(res, { comments });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getReplies: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { commentId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const repliesEn = await commentService.getReplies(commentId, page, limit);
      const replies = await translateCommentDtos(repliesEn, req.resolvedLanguage);
      sendSuccess(res, { replies });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  addComment: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const { body, parentId } = req.body;
      const result = await commentService.addComment(newsId, req.userId!, body, parentId);
      sendSuccess(res, result, 201);
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      sendError(res, error.message, status);
    }
  },

  deleteComment: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId, commentId } = req.params;
      const result = await commentService.deleteComment(newsId, commentId, req.userId!);
      sendSuccess(res, result);
    } catch (error: any) {
      const status = error.message.includes('Not authorized')
        ? 403
        : error.message.includes('not found')
          ? 404
          : 400;
      sendError(res, error.message, status);
    }
  },
};
