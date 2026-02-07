import { Request, Response } from 'express';
import { marketService } from './service';
import { sendSuccess, sendError } from '../../utils/response';

export const marketController = {
  getTrending: async (req: Request, res: Response): Promise<void> => {
    try {
      const coins = await marketService.getTrending();
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getTopGainers: async (req: Request, res: Response): Promise<void> => {
    try {
      const coins = await marketService.getTopGainers();
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getTopLosers: async (req: Request, res: Response): Promise<void> => {
    try {
      const coins = await marketService.getTopLosers();
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },
};

