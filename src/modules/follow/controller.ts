import { Response } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { AuthRequest } from '../../types';
import { followService } from './service';

const parsePage = (value: unknown): number => Math.max(1, parseInt(String(value || '1'), 10) || 1);
const parseLimit = (value: unknown): number => Math.max(1, parseInt(String(value || '20'), 10) || 20);

export const followController = {
  followCoin: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const result = await followService.followCoin(req.userId!, coinId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  unfollowCoin: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const result = await followService.unfollowCoin(req.userId!, coinId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  followUser: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const result = await followService.followUser(req.userId!, userId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  unfollowUser: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const result = await followService.unfollowUser(req.userId!, userId);
      sendSuccess(res, result);
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  },

  getFollowedCoins: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const coins = await followService.getFollowedCoins(req.userId!);
      sendSuccess(res, { coins });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getFollowedUsers: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const users = await followService.getFollowedUsers(req.userId!);
      sendSuccess(res, { users });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getUserFollowers: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const page = parsePage(req.query.page);
      const limit = parseLimit(req.query.limit);
      const followers = await followService.getUserFollowers(userId, page, limit);
      sendSuccess(res, { followers });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getCoinFollowers: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const page = parsePage(req.query.page);
      const limit = parseLimit(req.query.limit);
      const followers = await followService.getCoinFollowers(coinId, page, limit);
      sendSuccess(res, { followers });
    } catch (error: any) {
      sendError(res, error.message, 500);
    }
  },

  getUserFollowStats: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const stats = await followService.getUserFollowStats(userId);
      sendSuccess(res, stats);
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },

  getCoinFollowStats: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coinId } = req.params;
      const stats = await followService.getCoinFollowStats(coinId);
      sendSuccess(res, stats);
    } catch (error: any) {
      sendError(res, error.message, 404);
    }
  },
};
