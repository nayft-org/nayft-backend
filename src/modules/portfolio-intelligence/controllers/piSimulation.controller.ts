import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { sendSuccess, sendError } from '../../../utils/response';
import { portfolioSimulationService } from '../simulation/portfolioSimulation.service';
import { featureService } from '../../../core/feature-system/feature.service';

export const piSimulationController = {
  simulate: async (req: AuthRequest, res: Response): Promise<void> => {
    const enabled = await featureService.isActive('portfolio_intelligence_simulation');
    if (!enabled) {
      sendError(res, 'Portfolio simulation is not enabled', 403);
      return;
    }
    const { adjustments, label } = req.body ?? {};
    if (!Array.isArray(adjustments)) {
      sendError(res, 'adjustments array required', 400);
      return;
    }
    const result = await portfolioSimulationService.simulateAllocationWhatIf({
      userId: req.userId!,
      adjustments,
      label: typeof label === 'string' ? label : undefined,
    });
    sendSuccess(res, result);
  },

  getSimulation: async (req: AuthRequest, res: Response): Promise<void> => {
    const enabled = await featureService.isActive('portfolio_intelligence_simulation');
    if (!enabled) {
      sendError(res, 'Portfolio simulation is not enabled', 403);
      return;
    }
    const data = await portfolioSimulationService.getSimulation(req.params.id);
    if (!data) {
      sendError(res, 'Simulation not found or expired', 404);
      return;
    }
    sendSuccess(res, data);
  },
};
