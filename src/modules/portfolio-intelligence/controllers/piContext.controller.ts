import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { sendSuccess, sendError } from '../../../utils/response';
import { piReadService } from '../services/piRead.service';
import { recomputeEnqueueService } from '../services/recomputeEnqueue.service';
import { piConfig } from '../config/piConfig';
import { featureService } from '../../../core/feature-system/feature.service';

async function enginesOrPiEnabled(): Promise<boolean> {
  const engines = await featureService.isActive('portfolio_intelligence_engines');
  return engines || piConfig.enabled;
}

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
      if (!(await enginesOrPiEnabled()) && !piConfig.enabled) {
        sendError(res, 'Portfolio intelligence is not enabled', 403);
        return;
      }
      const data = await piReadService.getLatestAnalytics(req.userId!);
      sendSuccess(res, data);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to load snapshot', 500);
    }
  },

  getSummary: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const health = await featureService.isActive('portfolio_intelligence_health_score');
      if (!health && !(await enginesOrPiEnabled())) {
        sendError(res, 'Portfolio health score is not enabled', 403);
        return;
      }
      const summary = await piReadService.ensureSummary(req.userId!);
      sendSuccess(res, summary);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to load summary', 500);
    }
  },

  getInsights: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const insightsFlag = await featureService.isActive('portfolio_intelligence_insights');
      if (!insightsFlag && !(await enginesOrPiEnabled())) {
        sendError(res, 'Portfolio insights are not enabled', 403);
        return;
      }
      const data = await piReadService.getInsights(req.userId!);
      sendSuccess(res, data);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to load insights', 500);
    }
  },

  manualRecompute: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const enabled = await featureService.isActive('portfolio_intelligence_foundation');
      if (!enabled && !piConfig.enabled && !piConfig.workerEnabled) {
        sendError(res, 'Portfolio intelligence is not enabled', 403);
        return;
      }
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
