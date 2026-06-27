import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { sendSuccess, sendError } from '../../../utils/response';
import { aiAnalystGovernanceService } from '../ai-analyst/aiAnalystGovernance.service';
import { portfolioIntelligenceFacade } from '../services/portfolioIntelligenceFacade.service';
import { featureService } from '../../../core/feature-system/feature.service';

export const piAiAnalystController = {
  getContext: async (req: AuthRequest, res: Response): Promise<void> => {
    const enabled = await featureService.isActive('portfolio_intelligence_ai_analyst');
    if (!enabled) {
      sendError(res, 'AI Portfolio Analyst is not enabled', 403);
      return;
    }
    const ctx = await portfolioIntelligenceFacade.getAiAnalystContext(req.userId!);
    if (!ctx) {
      sendError(res, 'No portfolio context available', 404);
      return;
    }
    sendSuccess(res, ctx);
  },

  chat: async (req: AuthRequest, res: Response): Promise<void> => {
    const enabled = await featureService.isActive('portfolio_intelligence_ai_analyst');
    if (!enabled) {
      sendError(res, 'AI Portfolio Analyst is not enabled', 403);
      return;
    }
    const message = String(req.body?.message ?? '').trim();
    if (!message) {
      sendError(res, 'message required', 400);
      return;
    }
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;
    const result = await aiAnalystGovernanceService.handleChatTurn({
      userId: req.userId!,
      message,
      sessionId,
    });
    sendSuccess(res, result);
  },
};
