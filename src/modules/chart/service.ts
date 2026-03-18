import { chartRepository } from './repository';
import type { KlineInterval } from './model';
import { streamConfig } from '../../config/streamConfig';

const QUOTE_SUFFIXES = ['USDT', 'USDC', 'BUSD', 'USD'];

function normalizeChartSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase();
  if (!symbol) return '';
  for (const suffix of QUOTE_SUFFIXES) {
    if (symbol.endsWith(suffix) && symbol.length > suffix.length) {
      return symbol.slice(0, -suffix.length);
    }
  }
  return symbol;
}

/** Interval to milliseconds for bucketing trades */
const INTERVAL_MS: Record<KlineInterval, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

export const chartService = {
  async getKlines(params: {
    symbol: string;
    interval: KlineInterval;
    from?: string;
    to?: string;
    exchange?: string;
    limit?: number;
  }) {
    const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
    const symbol = normalizeChartSymbol(params.symbol);
    const interval = params.interval;
    const limit = Math.min(params.limit ?? 1000, 2000);

    const now = new Date();
    let from: Date;
    let to: Date;

    if (params.from && params.to) {
      from = new Date(params.from);
      to = new Date(params.to);
    } else {
      const days =
        interval === '1m' ? 7 : interval === '5m' ? 30 : interval === '1h' ? 90 : interval === '1d' ? 365 : 730;
      to = now;
      from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    let klines = await chartRepository.findKlines({
      exchange,
      symbol,
      interval,
      from,
      to,
      limit,
    });

    if (klines.length === 0) {
      klines = await this.aggregateKlinesFromTrades({
        exchange,
        symbol,
        interval,
        from,
        to,
        limit,
      });
    }

    return klines;
  },

  async aggregateKlinesFromTrades(params: {
    exchange: string;
    symbol: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit: number;
  }) {
    const { exchange, symbol, interval, from, to, limit } = params;
    const trades = await chartRepository.findTrades({
      exchange,
      symbol,
      from,
      to,
      limit: Math.min(limit * 100, 20000),
      dataType: 'aggTrade',
      sortAsc: true,
    });

    if (trades.length === 0) return [];

    const bucketMs = INTERVAL_MS[interval];
    const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

    for (const t of trades) {
      const time = typeof t.time === 'string' ? new Date(t.time).getTime() : t.time.getTime();
      const bucketStart = Math.floor(time / bucketMs) * bucketMs;

      const existing = buckets.get(bucketStart);
      if (existing) {
        existing.high = Math.max(existing.high, t.price);
        existing.low = Math.min(existing.low, t.price);
        existing.close = t.price;
        existing.volume += t.quantity;
      } else {
        buckets.set(bucketStart, {
          open: t.price,
          high: t.price,
          low: t.price,
          close: t.price,
          volume: t.quantity,
        });
      }
    }

    const sorted = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-limit)
      .map(([openTime, ohlcv]) => ({
        openTime: new Date(openTime),
        open: ohlcv.open,
        high: ohlcv.high,
        low: ohlcv.low,
        close: ohlcv.close,
        volume: ohlcv.volume,
      }));

    return sorted;
  },

  async getTrades(params: {
    symbol: string;
    from?: string;
    to?: string;
    exchange?: string;
    limit?: number;
    dataType?: 'trade' | 'aggTrade';
  }) {
    const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
    const symbol = normalizeChartSymbol(params.symbol);
    const limit = Math.min(params.limit ?? 1000, 2000);
    const dataType = params.dataType || 'aggTrade';

    const now = new Date();
    const to = params.to ? new Date(params.to) : now;
    const from = params.from ? new Date(params.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return chartRepository.findTrades({
      exchange,
      symbol,
      from,
      to,
      limit,
      dataType,
    });
  },
};
