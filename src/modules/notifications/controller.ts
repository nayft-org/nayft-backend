import { Response } from 'express';
import { AuthRequest } from '../../types';
import { sendError, sendSuccess } from '../../utils/response';
import { notificationsService } from './service';

export const notificationsController = {
  list: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const cursor = req.query.cursor as string | undefined;
      const status = req.query.status as 'unread' | 'all' | 'read' | undefined;
      const category = req.query.category as string | undefined;
      const sinceSeq =
        req.query.sinceSeq !== undefined ? parseInt(String(req.query.sinceSeq), 10) : undefined;

      const result = await notificationsService.listForUser(req.userId!, {
        limit,
        cursor,
        status: status === 'read' || status === 'unread' ? status : status === 'all' ? 'all' : undefined,
        category,
        sinceSeq: Number.isFinite(sinceSeq) ? sinceSeq : undefined,
      });
      sendSuccess(res, result);
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },

  markRead: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await notificationsService.markRead(req.userId!, req.params.id);
      sendSuccess(res, result);
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },

  markAllRead: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const category = typeof req.body?.category === 'string' ? req.body.category : undefined;
      const result = await notificationsService.markAllRead(req.userId!, category);
      sendSuccess(res, result);
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },

  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await notificationsService.softDelete(req.userId!, req.params.id);
      sendSuccess(res, result);
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },

  getPreferences: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const prefs = await notificationsService.getPreferences(req.userId!);
      sendSuccess(res, prefs);
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },

  patchPreferences: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const prefs = await notificationsService.patchPreferences(req.userId!, req.body ?? {});
      sendSuccess(res, prefs);
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },

  unreadCount: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const count = await notificationsService.reconcileUnreadCount(req.userId!);
      sendSuccess(res, { unreadCount: count });
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },
};
