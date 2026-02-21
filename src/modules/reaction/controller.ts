import { Response } from 'express';
import { reactionService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import { REACTION_TYPES, ReactionType } from './model';

export const reactionController = {
  toggle: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const { type } = req.body;

      if (!type || !REACTION_TYPES.includes(type as ReactionType)) {
        sendError(res, `Invalid reaction type. Must be one of: ${REACTION_TYPES.join(', ')}`, 400);
        return;
      }

      const result = await reactionService.toggleReaction(req.userId!, newsId, type as ReactionType);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const result = await reactionService.removeReaction(req.userId!, newsId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  get: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const result = await reactionService.getReactions(newsId, req.userId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getUsers: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { newsId } = req.params;
      const type = req.query.type as string;

      if (!type || !REACTION_TYPES.includes(type as ReactionType)) {
        sendError(res, `Query param 'type' is required and must be one of: ${REACTION_TYPES.join(', ')}`, 400);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const users = await reactionService.getReactionUsers(newsId, type as ReactionType, page, limit);
      sendSuccess(res, { users });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};
