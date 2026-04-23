import { Request, Response } from 'express';
import { MongoNetworkTimeoutError } from 'mongodb';
import { chartService } from './service';
import type { KlineInterval } from './model';
import { config } from '../../config/env';

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
      const fields = String(req.query.fields || '').toLowerCase();
      if (fields === 'minimal' || fields === 'ohlcv') {
        res.json(
          klines.map((k) => ({
            openTime: k.openTime,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
            volume: k.volume,
          }))
        );
        return;
      }
      res.json(klines);
    } catch (err) {
      console.error('[chartController.getKlines]', err);
      if (err instanceof MongoNetworkTimeoutError) {
        res.status(503).json({
          error:
            'Database timeout fetching klines. Ensure MongoDB is running (e.g. docker compose up mongodb) and reachable at MONGO_URI.',
        });
        return;
      }
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

  getMarketTrend: async (req: Request, res: Response) => {
    try {
      const interval = String(req.query.interval || '1m').toLowerCase() as KlineInterval;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const exchange = req.query.exchange as string | undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const maxCoins = req.query.maxCoins ? parseInt(String(req.query.maxCoins), 10) : undefined;

      if (!VALID_INTERVALS.includes(interval)) {
        res.status(400).json({ error: `interval must be one of: ${VALID_INTERVALS.join(', ')}` });
        return;
      }

      const marketTrend = config.marketTrendDefaultToV2Enabled
        ? await chartService.getMarketTrendV2({
            interval,
            from,
            to,
            exchange,
            limit,
            maxCoins,
          })
        : await chartService.getMarketTrend({
            interval,
            from,
            to,
            exchange,
            limit,
            maxCoins,
          });

      res.json(marketTrend);
    } catch (err) {
      console.error('[chartController.getMarketTrend]', err);
      res.status(500).json({ error: 'Failed to fetch market trend' });
    }
  },

  getMarketTrendV2: async (req: Request, res: Response) => {
    try {
      const interval = String(req.query.interval || '1m').toLowerCase() as KlineInterval;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const exchange = req.query.exchange as string | undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const maxCoins = req.query.maxCoins ? parseInt(String(req.query.maxCoins), 10) : undefined;

      if (!VALID_INTERVALS.includes(interval)) {
        res.status(400).json({ error: `interval must be one of: ${VALID_INTERVALS.join(', ')}` });
        return;
      }

      const marketTrend = await chartService.getMarketTrendV2({
        interval,
        from,
        to,
        exchange,
        limit,
        maxCoins,
      });

      res.json(marketTrend);
    } catch (err) {
      console.error('[chartController.getMarketTrendV2]', err);
      res.status(500).json({ error: 'Failed to fetch market trend v2' });
    }
  },
};
