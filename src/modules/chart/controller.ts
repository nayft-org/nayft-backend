import { Request, Response } from 'express';
import { chartService } from './service';
import type { KlineInterval } from './model';

const VALID_INTERVALS: KlineInterval[] = ['1m', '5m', '1h', '1d', '1w'];

export const chartController = {
  getKlines: async (req: Request, res: Response) => {
    try {
      const symbol = String(req.query.symbol || '').trim();
      const interval = String(req.query.interval || '1h').toLowerCase() as KlineInterval;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const exchange = req.query.exchange as string | undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

      if (!symbol) {
        res.status(400).json({ error: 'symbol is required' });
        return;
      }

      if (!VALID_INTERVALS.includes(interval)) {
        res.status(400).json({ error: `interval must be one of: ${VALID_INTERVALS.join(', ')}` });
        return;
      }

      const klines = await chartService.getKlines({ symbol, interval, from, to, exchange, limit });
      res.json(klines);
    } catch (err) {
      console.error('[chartController.getKlines]', err);
      res.status(500).json({ error: 'Failed to fetch klines' });
    }
  },

  getTrades: async (req: Request, res: Response) => {
    try {
      const symbol = String(req.query.symbol || '').trim();
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const exchange = req.query.exchange as string | undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

      if (!symbol) {
        res.status(400).json({ error: 'symbol is required' });
        return;
      }

      const trades = await chartService.getTrades({ symbol, from, to, exchange, limit, dataType: 'aggTrade' });
      res.json(trades);
    } catch (err) {
      console.error('[chartController.getTrades]', err);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  },

  getAggTrades: async (req: Request, res: Response) => {
    try {
      const symbol = String(req.query.symbol || '').trim();
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const exchange = req.query.exchange as string | undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

      if (!symbol) {
        res.status(400).json({ error: 'symbol is required' });
        return;
      }

      const trades = await chartService.getTrades({ symbol, from, to, exchange, limit, dataType: 'aggTrade' });
      res.json(trades);
    } catch (err) {
      console.error('[chartController.getAggTrades]', err);
      res.status(500).json({ error: 'Failed to fetch aggTrades' });
    }
  },
};
