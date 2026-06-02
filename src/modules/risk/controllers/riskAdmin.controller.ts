import { Request, Response } from 'express';
import { riskMetrics } from '../../../observability/riskMetrics';
import { riskConfig } from '../config/riskConfig';
import { runRiskBuild } from '../build/riskBuildCoordinator';
import { runRiskReplay } from '../replay/replayEngine';
import { getActiveManifest } from '../publish/riskSnapshotPublisher';
export const riskAdminController = {
  health: async (_req: Request, res: Response): Promise<void> => {
    const manifest = await getActiveManifest();
    res.json({
      success: true,
      data: {
        enabled: riskConfig.enabled,
        buildEnabled: riskConfig.buildEnabled,
        apiEnabled: riskConfig.apiEnabled,
        shadowMode: riskConfig.shadowMode,
        lastBuildDurationMs: riskMetrics.lastBuildDurationMs,
        lastRevision: riskMetrics.lastRevision,
        lastBuildAt: riskMetrics.lastBuildAt,
        universeSize: riskMetrics.universeSize,
        buildSkippedOverlapTotal: riskMetrics.buildSkippedOverlapTotal,
        buildFailedTotal: riskMetrics.buildFailedTotal,
        buildValidationFailedTotal: riskMetrics.buildValidationFailedTotal,
        manifestComplete: manifest?.complete ?? false,
        manifestRevision: manifest?.revision ?? null,
      },
    });
  },

  recalculate: async (_req: Request, res: Response): Promise<void> => {
    const result = await runRiskBuild();
    res.json({ success: result.ok, data: result });
  },

  replay: async (req: Request, res: Response): Promise<void> => {
    const sourceBuildId = String(req.body?.sourceBuildId || req.query?.sourceBuildId || '');
    if (!sourceBuildId) {
      res.status(400).json({ success: false, error: 'sourceBuildId required' });
      return;
    }
    const result = await runRiskReplay(sourceBuildId);
    res.json({ success: result.ok, data: result });
  },
};
