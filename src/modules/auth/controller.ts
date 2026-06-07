import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { authService } from './service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_ZXCVBN_SCORE,
  PASSWORD_RECOMMENDED_LENGTH,
} from '@nayft/password-policy';

export const authController = {
  getPasswordPolicy: async (_req: Request, res: Response): Promise<void> => {
    sendSuccess(res, {
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
      minZxcvbnScore: PASSWORD_MIN_ZXCVBN_SCORE,
      recommendedLength: PASSWORD_RECOMMENDED_LENGTH,
      minimumLevel: 'strong',
    });
  },

  signup: async (req: Request, res: Response): Promise<void> => {
    try {
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

  googleSignIn: async (req: Request, res: Response): Promise<void> => {
    try {
      const { idToken } = req.body;
      if (!idToken || typeof idToken !== 'string') {
        sendError(res, 'idToken is required', 400);
        return;
      }
      const result = await authService.googleSignIn(idToken);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 401);
    }
  },

  changePassword: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await authService.changePassword(req.userId!, req.body);
      sendSuccess(res, { message: 'Password changed successfully' });
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  resetPassword: async (req: Request, res: Response): Promise<void> => {
    try {
      await authService.resetPassword(req.body);
      sendSuccess(res, { message: 'Password reset is not yet available' }, 501);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },
};
