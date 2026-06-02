import { Request, Response } from 'express';
import { riskConfig } from '../config/riskConfig';
import { riskReadService } from '../services/riskRead.service';

function apiDisabled(res: Response): boolean {
  if (!riskConfig.apiEnabled) {
    res.status(503).json({ success: false, error: 'Risk API disabled' });
    return true;
  }
  return false;
}

export const riskController = {
  getSnapshot: async (_req: Request, res: Response): Promise<void> => {
    if (apiDisabled(res)) return;
    const { meta, data, manifest } = await riskReadService.getSnapshot();
    res.json({ success: true, meta, manifest, data });
  },

  getCoin: async (req: Request, res: Response): Promise<void> => {
    if (apiDisabled(res)) return;
    const { meta, data } = await riskReadService.getCoin(String(req.params.symbol || ''));
    if (!data) {
      res.json({
        success: true,
        meta,
        data: { symbol: String(req.params.symbol).toUpperCase(), crs: 0.5, confidence: 0 },
      });
      return;
    }
    res.json({ success: true, meta, data });
  },

  getTopRisk: async (req: Request, res: Response): Promise<void> => {
    if (apiDisabled(res)) return;
    const limit = Math.min(100, parseInt(String(req.query.limit || '50'), 10));
    const { meta, coins } = await riskReadService.getTopRisk(limit);
    res.json({ success: true, meta, data: { coins } });
  },

  getMovers: async (_req: Request, res: Response): Promise<void> => {
    if (apiDisabled(res)) return;
    const { meta, data } = await riskReadService.getMovers();
    res.json({ success: true, meta, data });
  },

  getRegime: async (_req: Request, res: Response): Promise<void> => {
    if (apiDisabled(res)) return;
    const { meta, data } = await riskReadService.getRegime();
    res.json({ success: true, meta, data });
  },

  getHistory: async (req: Request, res: Response): Promise<void> => {
    if (apiDisabled(res)) return;
    const symbol = String(req.params.symbol || '');
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const limit = Math.min(500, parseInt(String(req.query.limit || '200'), 10));
    const { points } = await riskReadService.getHistory(symbol, from, to, limit);
    res.json({ success: true, data: { symbol: symbol.toUpperCase(), points } });
  },
};
