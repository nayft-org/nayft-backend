import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { computeSourceBrandingHealth } from './services/sourceHealth.service';
import { listSources, approveSource, blockSource, refreshArticleCounts } from './services/sourceRegistry.service';
import { runConsistencyValidator } from './services/sourceConsistencyValidator.service';
import { SourceRepairQueue } from './models/SourceRepairQueue';

export const sourceAdminController = {
  health: async (req: Request, res: Response): Promise<void> => {
    try {
      const force = req.query.refresh === '1';
      const snapshot = await computeSourceBrandingHealth(force);
      sendSuccess(res, snapshot);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to compute source health', 500);
    }
  },

  list: async (req: Request, res: Response): Promise<void> => {
    try {
      const status = (req.query.status as string | undefined);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const skip = Math.max(0, Number(req.query.skip || 0));
      const sources = await listSources({ status: status as any, limit, skip });
      sendSuccess(res, { sources });
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to list sources', 500);
    }
  },

  approve: async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourceKey } = req.params;
      const { trustScore } = req.body ?? {};
      const actorId = req.headers['x-admin-actor'] as string | undefined;
      await approveSource(sourceKey, { trustScore: trustScore != null ? Number(trustScore) : undefined, actorId });
      sendSuccess(res, { ok: true });
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to approve source', 500);
    }
  },

  block: async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourceKey } = req.params;
      const actorId = req.headers['x-admin-actor'] as string | undefined;
      await blockSource(sourceKey, { actorId });
      sendSuccess(res, { ok: true });
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to block source', 500);
    }
  },

  repairStatus: async (_req: Request, res: Response): Promise<void> => {
    try {
      const [pending, failed, done] = await Promise.all([
        SourceRepairQueue.countDocuments({ status: 'pending' }),
        SourceRepairQueue.countDocuments({ status: 'failed' }),
        SourceRepairQueue.countDocuments({ status: 'done' }),
      ]);
      const recent = await SourceRepairQueue.find({ status: 'failed' })
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean();
      sendSuccess(res, { pending, failed, done, recentFailures: recent });
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to fetch repair status', 500);
    }
  },

  replayRepair: async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourceKey, repairType } = req.body ?? {};
      if (!sourceKey || !repairType) {
        sendError(res, 'sourceKey and repairType are required', 400);
        return;
      }
      await SourceRepairQueue.updateOne(
        { sourceKey, repairType },
        { $set: { status: 'pending', attempts: 0, nextRetryAt: new Date() } }
      );
      sendSuccess(res, { queued: true });
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to replay repair', 500);
    }
  },

  runConsistency: async (_req: Request, res: Response): Promise<void> => {
    try {
      const report = await runConsistencyValidator();
      sendSuccess(res, report);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Consistency validator failed', 500);
    }
  },

  refreshArticleCounts: async (_req: Request, res: Response): Promise<void> => {
    try {
      await refreshArticleCounts();
      sendSuccess(res, { ok: true });
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Failed to refresh article counts', 500);
    }
  },
};
