import { Response } from 'express';
import { wishlistService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export const wishlistController = {
  addToWishlist: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const result = await wishlistService.addToWishlist(req.userId!, coinId);
      sendSuccess(res, result, 201);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  removeFromWishlist: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const result = await wishlistService.removeFromWishlist(req.userId!, coinId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },

  getWishlist: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const coins = await wishlistService.getWishlist(req.userId!);
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};

