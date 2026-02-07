import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export const authController = {
  signup: async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, errors.array()[0].msg, 400);
        return;
      }

      const result = await authService.signup(req.body);
      sendSuccess(res, result, 201);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  login: async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, errors.array()[0].msg, 400);
        return;
      }

      const result = await authService.login(req.body);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 401);
    }
  },

  getMe: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await authService.getMe(req.userId!);
      sendSuccess(res, { user });
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },
};

