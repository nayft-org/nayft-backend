import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { emailService } from './email.service';
import { getEmailQueueAdapter } from './emailQueue.adapter';

export const emailAdminController = {
  health: async (_req: Request, res: Response): Promise<void> => {
    try {
      const snapshot = await emailService.getHealthSnapshot();
      sendSuccess(res, snapshot);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to fetch email health', 500);
    }
  },

  inspectJob: async (req: Request, res: Response): Promise<void> => {
    try {
      const job = await emailService.getJobById(req.params.jobId);
      if (!job) {
        sendError(res, 'Email job not found', 404);
        return;
      }
      sendSuccess(res, job);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to inspect email job', 500);
    }
  },

  replayDlqJob: async (req: Request, res: Response): Promise<void> => {
    try {
      const { replayRequestId, reason } = req.body || {};
      if (!replayRequestId || typeof replayRequestId !== 'string') {
        sendError(res, 'replayRequestId is required', 400);
        return;
      }
      const actor = req.headers['x-admin-actor'];
      const actorValue = typeof actor === 'string' && actor.trim() ? actor.trim() : 'admin';
      const result = await emailService.replayJob(req.params.jobId, replayRequestId, actorValue, String(reason || 'manual replay'));
      sendSuccess(res, result);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to replay job', 500);
    }
  },

  peekDlq: async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
      const items = await getEmailQueueAdapter().peekDlq(limit);
      sendSuccess(res, { items });
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to inspect DLQ', 500);
    }
  },
};

