import { Response } from 'express';
import { AuthRequest } from '../../types';
import { sendError, sendSuccess } from '../../utils/response';
import { userExportService } from './export.service';

export const userExportController = {
  exportMe: async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = await userExportService.exportUserData(req.userId!);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="nayft-export.json"');
      sendSuccess(res, data);
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : 'Export failed', 404);
    }
  },
};
