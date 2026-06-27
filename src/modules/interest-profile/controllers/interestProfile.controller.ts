import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { sendSuccess, sendError } from '../../../utils/response';
import { interestProfileService } from '../services/interestProfile.service';
import { enqueueInterestProfileRecompute } from '../jobs/interestProfileWorker';
import { featureService } from '../../../core/feature-system/feature.service';

export const interestProfileController = {
  getProfile: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const enabled = await featureService.isActive('interest_profile_engine');
      if (!enabled) {
        sendError(res, 'Interest profile is not enabled', 403);
        return;
      }
      const profile = await interestProfileService.getProfile(req.userId!);
      if (!profile) {
        sendError(res, 'No interest profile yet', 404);
        return;
      }
      sendSuccess(res, profile);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to load profile', 500);
    }
  },

  syncSignals: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const enabled = await featureService.isActive('interest_profile_engine');
      if (!enabled) {
        sendError(res, 'Interest profile is not enabled', 403);
        return;
      }
      const body = req.body ?? {};
      const readArticleIds = Array.isArray(body.readArticleIds)
        ? body.readArticleIds.map(String).slice(0, 100)
        : undefined;
      const savedArticleIds = Array.isArray(body.savedArticleIds)
        ? body.savedArticleIds.map(String).slice(0, 100)
        : undefined;
      const searchedSymbols = Array.isArray(body.searchedSymbols)
        ? body.searchedSymbols.map(String).slice(0, 20)
        : undefined;
      const dwellTimeBuckets =
        body.dwellTimeBuckets && typeof body.dwellTimeBuckets === 'object'
          ? (body.dwellTimeBuckets as Record<string, number>)
          : undefined;

      const result = await interestProfileService.syncSignals(req.userId!, {
        readArticleIds,
        savedArticleIds,
        searchedSymbols,
        dwellTimeBuckets,
      });
      await enqueueInterestProfileRecompute(req.userId!);
      sendSuccess(res, { accepted: true, revision: result.revision });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Sync failed', 500);
    }
  },

  recompute: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const enabled = await featureService.isActive('interest_profile_engine');
      if (!enabled) {
        sendError(res, 'Interest profile is not enabled', 403);
        return;
      }
      await enqueueInterestProfileRecompute(req.userId!);
      sendSuccess(res, { enqueued: true });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Enqueue failed', 500);
    }
  },
};
