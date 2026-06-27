import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { sendSuccess, sendError } from '../../../utils/response';
import { goalProfileService, type GoalProfileId } from '../services/goalProfile.service';
import { recomputeEnqueueService } from '../services/recomputeEnqueue.service';
import { featureService } from '../../../core/feature-system/feature.service';

const VALID_PROFILES: GoalProfileId[] = [
  'capital_preservation',
  'balanced_growth',
  'aggressive_growth',
  'yield_generation',
  'narrative_investing',
];

export const piGoalController = {
  getGoal: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const enabled = await featureService.isActive('portfolio_intelligence_goal_profiles');
      if (!enabled) {
        sendError(res, 'Goal profiles are not enabled', 403);
        return;
      }
      const profile = await goalProfileService.getGoalProfile(req.userId!);
      sendSuccess(res, profile);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to load goal profile', 500);
    }
  },

  setGoal: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const enabled = await featureService.isActive('portfolio_intelligence_goal_profiles');
      if (!enabled) {
        sendError(res, 'Goal profiles are not enabled', 403);
        return;
      }
      const goalProfileId = String(req.body?.goalProfileId ?? '') as GoalProfileId;
      if (!VALID_PROFILES.includes(goalProfileId)) {
        sendError(res, `Invalid goalProfileId. Allowed: ${VALID_PROFILES.join(', ')}`, 400);
        return;
      }
      await goalProfileService.setGoalProfile(req.userId!, goalProfileId, 'settings');
      const enqueued = await recomputeEnqueueService.enqueue(req.userId!, 'manual', {
        bypassDebounce: true,
        highPriority: true,
      });
      sendSuccess(res, { goalProfileId, enqueued });
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to set goal profile', 500);
    }
  },
};
