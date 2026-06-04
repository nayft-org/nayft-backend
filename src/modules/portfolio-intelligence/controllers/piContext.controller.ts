import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { sendSuccess, sendError } from '../../../utils/response';
import { piReadService } from '../services/piRead.service';
import { recomputeEnqueueService } from '../services/recomputeEnqueue.service';
import { piConfig } from '../config/piConfig';
import { featureService } from '../../../core/feature-system/feature.service';

export const piContextController = {
  getContext: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const enabled = await featureService.isActive('portfolio_intelligence_context_api');
      if (!enabled && !piConfig.enabled) {
        sendError(res, 'Portfolio intelligence context is not enabled', 403);
        return;
      }
      const ctx = await piReadService.getContext(req.userId!);
      sendSuccess(res, ctx);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to load context', 500);
    }
  },

  getLatestSnapshot: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const enabled = await featureService.isActive('portfolio_intelligence_context_api');
      if (!enabled && !piConfig.enabled) {
        sendError(res, 'Portfolio intelligence is not enabled', 403);
        return;
      }
      const data = await piReadService.getLatestAnalytics(req.userId!);
      sendSuccess(res, data);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to load snapshot', 500);
    }
  },

  manualRecompute: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ok = await recomputeEnqueueService.enqueue(req.userId!, 'manual', {
        bypassDebounce: true,
        highPriority: true,
      });
      sendSuccess(res, { enqueued: ok });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Enqueue failed', 500);
    }
  },
};
