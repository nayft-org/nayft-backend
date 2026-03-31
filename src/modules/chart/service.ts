import { chartRepository } from './repository';
import type { KlineInterval } from './model';
import { streamConfig } from '../../config/streamConfig';
import { LabeledActiveCoin } from '../coin/models/LabeledActiveCoin';
import {
  withResponseCache,
  buildChartMarketTrendKey,
  buildChartMarketTrendV2Key,
  buildChartKlinesKey,
} from '../../utils/responseCache';
import { config } from '../../config/env';

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

const MARKET_TREND_CACHE_TTL = 45;
const KL_TTL: Record<KlineInterval, number> = {
  '1m': 30,
  '5m': 45,
  '1h': 90,
  '1d': 120,
  '1w': 180,
};

async function buildMarketTrendPayload(params: {
  interval?: KlineInterval;
  from?: string;
  to?: string;
  exchange?: string;
  limit?: number;
  maxCoins?: number;
  useBatchedKlines: boolean;
}) {
  const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
  const interval = params.interval || '1m';
  const limit = Math.min(Math.max(params.limit ?? 240, 30), 720);
  const maxCoins = Math.min(Math.max(params.maxCoins ?? 25, 5), 100);

  const now = new Date();
  const bucketMs = INTERVAL_MS[interval];
  const to = params.to ? new Date(params.to) : now;
  const from = params.from
    ? new Date(params.from)
    : new Date(to.getTime() - bucketMs * (limit + Math.ceil(limit * 0.5)));

  const activeCoins = await LabeledActiveCoin.find({
    symbol: { $exists: true, $ne: '' },
    market_cap: { $gt: 0 },
  })
    .select('symbol market_cap market_cap_change_percentage_24h market_cap_rank')
    .sort({ market_cap_rank: 1 })
    .limit(maxCoins)
    .lean();

  const constituents = activeCoins
    .map((coin) => ({
      symbol: String(coin.symbol || '').trim().toUpperCase(),
      marketCap: Number(coin.market_cap || 0),
      marketCapChange24h: Number(coin.market_cap_change_percentage_24h || 0),
    }))
    .filter((coin) => coin.symbol && Number.isFinite(coin.marketCap) && coin.marketCap > 0);

  const findParams = {
    exchange,
    interval,
    from,
    to,
    limit,
    constituents: constituents.map(({ symbol, marketCap }) => ({ symbol, marketCap })),
  };

  const points = params.useBatchedKlines
    ? await chartRepository.findMarketTrendBatched(findParams)
    : await chartRepository.findMarketTrend(findParams);

  const latestValue = constituents.reduce((sum, coin) => sum + coin.marketCap, 0);
  const previousValue = constituents.reduce((sum, coin) => {
    const divisor = 1 + coin.marketCapChange24h / 100;
    if (!Number.isFinite(divisor) || divisor <= 0) return sum;
    return sum + coin.marketCap / divisor;
  }, 0);

  const absoluteChange24h = latestValue - previousValue;
  const relativeChange24h = previousValue > 0 ? (absoluteChange24h / previousValue) * 100 : 0;

  return {
    points,
    latestValue,
    absoluteChange24h,
    relativeChange24h,
    range: {
      interval,
      from,
      to,
      limit,
    },
    constituents: constituents.length,
  };
}

async function aggregateKlinesFromTradesImpl(params: {
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

  return Array.from(buckets.entries())
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
}

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

    const cacheKey = buildChartKlinesKey({
      exchange,
      symbol: symbol.toUpperCase(),
      interval,
      limit,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    });

    const { data } = await withResponseCache({
      cacheKey,
      ttlSeconds: KL_TTL[interval] ?? 60,
      metricsKind: 'chart:kl',
      fetcher: async () => {
        let klines = await chartRepository.findKlines({
          exchange,
          symbol,
          interval,
          from,
          to,
          limit,
        });
        if (klines.length === 0) {
          klines = await aggregateKlinesFromTradesImpl({
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
    });
    return data;
  },

  async aggregateKlinesFromTrades(params: {
    exchange: string;
    symbol: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit: number;
  }) {
    return aggregateKlinesFromTradesImpl(params);
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

  async getMarketTrend(params: {
    interval?: KlineInterval;
    from?: string;
    to?: string;
    exchange?: string;
    limit?: number;
    maxCoins?: number;
  }) {
    const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
    const interval = params.interval || '1m';
    const limit = Math.min(Math.max(params.limit ?? 240, 30), 720);
    const maxCoins = Math.min(Math.max(params.maxCoins ?? 25, 5), 100);

    const now = new Date();
    const bucketMs = INTERVAL_MS[interval];
    const to = params.to ? new Date(params.to) : now;
    const from = params.from
      ? new Date(params.from)
      : new Date(to.getTime() - bucketMs * (limit + Math.ceil(limit * 0.5)));

    const cacheKey = buildChartMarketTrendKey({
      exchange,
      interval,
      limit,
      maxCoins,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    });

    const { data } = await withResponseCache({
      cacheKey,
      ttlSeconds: MARKET_TREND_CACHE_TTL,
      metricsKind: 'chart:mt',
      fetcher: () =>
        buildMarketTrendPayload({
          ...params,
          useBatchedKlines: false,
        }),
    });
    return data;
  },

  /** Shadow / rollout path: batched Mongo reads (single aggregation per request). */
  async getMarketTrendV2(params: {
    interval?: KlineInterval;
    from?: string;
    to?: string;
    exchange?: string;
    limit?: number;
    maxCoins?: number;
  }) {
    if (!config.marketTrendV2Enabled) {
      return this.getMarketTrend(params);
    }

    const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
    const interval = params.interval || '1m';
    const limit = Math.min(Math.max(params.limit ?? 240, 30), 720);
    const maxCoins = Math.min(Math.max(params.maxCoins ?? 25, 5), 100);

    const now = new Date();
    const bucketMs = INTERVAL_MS[interval];
    const to = params.to ? new Date(params.to) : now;
    const from = params.from
      ? new Date(params.from)
      : new Date(to.getTime() - bucketMs * (limit + Math.ceil(limit * 0.5)));

    const cacheKey = buildChartMarketTrendV2Key({
      exchange,
      interval,
      limit,
      maxCoins,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    });

    const { data } = await withResponseCache({
      cacheKey,
      ttlSeconds: MARKET_TREND_CACHE_TTL,
      metricsKind: 'chart:mtv2',
      fetcher: () =>
        buildMarketTrendPayload({
          ...params,
          useBatchedKlines: true,
        }),
    });
    return data;
  },
};
