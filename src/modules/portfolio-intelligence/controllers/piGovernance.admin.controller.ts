import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { sendSuccess, sendError } from '../../../utils/response';
import { categoryGovernanceService } from '../services/categoryGovernance.service';
import { categoryMappingService } from '../services/categoryMapping.service';
import { recomputeEnqueueService } from '../services/recomputeEnqueue.service';

export const piGovernanceAdminController = {
  listCatalogVersions: async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const versions = await categoryGovernanceService.listCatalogVersions();
      sendSuccess(res, { versions });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to list catalog versions', 500);
    }
  },

  getCatalogVersion: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const version = parseInt(String(req.params.version), 10);
      const versions = await categoryGovernanceService.listCatalogVersions(100);
      const match = versions.find((v) => v.catalogVersion === version);
      if (!match) {
        sendError(res, 'Catalog version not found', 404);
        return;
      }
      sendSuccess(res, match);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to load catalog version', 500);
    }
  },

  listReviews: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const status = String(req.query.status || 'pending');
      const reviews = await categoryGovernanceService.listReviews(status);
      sendSuccess(res, { reviews });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to list reviews', 500);
    }
  },

  patchReview: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { status, resolution } = req.body ?? {};
      if (!['approved', 'rejected', 'deferred'].includes(status)) {
        sendError(res, 'Invalid status', 400);
        return;
      }
      const updated = await categoryGovernanceService.updateReview(String(req.params.id), {
        status,
        resolution,
        reviewedBy: req.userId,
      });
      if (!updated) {
        sendError(res, 'Review not found', 404);
        return;
      }
      sendSuccess(res, updated);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to update review', 500);
    }
  },

  createOverride: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { internalCoinId, primaryCategoryId, secondaryCategoryIds, reason } = req.body ?? {};
      if (!internalCoinId || !primaryCategoryId) {
        sendError(res, 'internalCoinId and primaryCategoryId required', 400);
        return;
      }
      const catalogVersion = await categoryMappingService.getCatalogVersion();
      const doc = await categoryGovernanceService.createOverride({
        internalCoinId,
        primaryCategoryId,
        secondaryCategoryIds,
        reason: reason ?? 'admin override',
        updatedBy: req.userId ?? 'admin',
        catalogVersion,
      });
      sendSuccess(res, doc);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to create override', 500);
    }
  },

  deleteOverride: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const catalogVersion = await categoryMappingService.getCatalogVersion();
      await categoryGovernanceService.deleteOverride(String(req.params.internalCoinId), catalogVersion);
      sendSuccess(res, { deleted: true });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to delete override', 500);
    }
  },

  listAudit: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const internalCoinId = req.query.internalCoinId ? String(req.query.internalCoinId) : undefined;
      const audit = await categoryGovernanceService.listAudit(internalCoinId);
      sendSuccess(res, { audit });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to list audit trail', 500);
    }
  },

  recomputeAffected: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { userIds } = req.body ?? {};
      if (!Array.isArray(userIds)) {
        sendError(res, 'userIds array required', 400);
        return;
      }
      let enqueued = 0;
      for (const userId of userIds.slice(0, 500)) {
        const ok = await recomputeEnqueueService.enqueue(String(userId), 'manual', { bypassDebounce: true });
        if (ok) enqueued += 1;
      }
      sendSuccess(res, { enqueued });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to enqueue recompute', 500);
    }
  },
};
