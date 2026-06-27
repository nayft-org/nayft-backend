import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { sendSuccess, sendError } from '../../../utils/response';
import { portfolioIntelligenceFacade } from '../services/portfolioIntelligenceFacade.service';
import { featureService } from '../../../core/feature-system/feature.service';
import { piConfig } from '../config/piConfig';

async function gateEngines(res: Response): Promise<boolean> {
  const engines = await featureService.isActive('portfolio_intelligence_engines');
  if (!engines && !piConfig.enabled) {
    sendError(res, 'Portfolio intelligence is not enabled', 403);
    return false;
  }
  return true;
}

export const piAnalyticsController = {
  getHealth: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getSlice(req.userId!, 'health');
    if (!data) {
      sendError(res, 'No analytics available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getRisk: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getSlice(req.userId!, 'risk');
    if (!data) {
      sendError(res, 'No analytics available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getAllocation: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getSlice(req.userId!, 'allocation');
    if (!data) {
      sendError(res, 'No analytics available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getNarrative: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getSlice(req.userId!, 'narrative');
    if (!data) {
      sendError(res, 'No analytics available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getIdentity: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getSlice(req.userId!, 'identity');
    if (!data) {
      sendError(res, 'No analytics available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getEvolution: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const daysRaw = parseInt(String(req.query.days || '30'), 10);
    const days = daysRaw === 90 ? 90 : 30;
    const data = await portfolioIntelligenceFacade.getEvolution(req.userId!, days);
    sendSuccess(res, data);
  },

  getConfidence: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getConfidence(req.userId!);
    if (!data) {
      sendError(res, 'No confidence data available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getExplain: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const engineId = req.params.engineId;
    if (engineId) {
      const data = await portfolioIntelligenceFacade.getExplainability(req.userId!, engineId);
      if (!data) {
        sendError(res, 'No explainability data available', 404);
        return;
      }
      sendSuccess(res, data);
      return;
    }
    const data = await portfolioIntelligenceFacade.getExplainability(req.userId!);
    if (!data || Object.keys(data).length === 0) {
      sendError(res, 'No explainability data available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getBenchmarks: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getBenchmarks(req.userId!);
    if (!data) {
      sendError(res, 'No benchmark data available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getOpportunities: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getOpportunities(req.userId!);
    sendSuccess(res, { opportunities: data });
  },

  getFeedContext: async (req: AuthRequest, res: Response): Promise<void> => {
    const enabled = await featureService.isActive('portfolio_intelligence_facade');
    if (!enabled && !piConfig.enabled) {
      sendError(res, 'Feed intelligence context is not enabled', 403);
      return;
    }
    const data = await portfolioIntelligenceFacade.getFeedIntelligenceContext(req.userId!);
    if (!data) {
      sendError(res, 'No feed context available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getNarrativeIntel: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const data = await portfolioIntelligenceFacade.getNarrativeIntel(req.userId!);
    if (!data) {
      sendError(res, 'No narrative intelligence available', 404);
      return;
    }
    sendSuccess(res, data);
  },

  getHistory: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!(await gateEngines(res))) return;
    const dimension = String(req.params.dimension || 'health');
    const daysRaw = parseInt(String(req.query.days || '30'), 10);
    const days = daysRaw === 90 ? 90 : 30;
    const allowed = ['identity', 'risk', 'narrative', 'health', 'allocation'];
    if (!allowed.includes(dimension)) {
      sendError(res, `Invalid dimension. Allowed: ${allowed.join(', ')}`, 400);
      return;
    }
    const data = await portfolioIntelligenceFacade.getHistoricalTimeline(req.userId!, dimension, days);
    sendSuccess(res, data);
  },
};
