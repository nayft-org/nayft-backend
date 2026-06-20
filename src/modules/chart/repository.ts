import pLimit from 'p-limit';
import { config } from '../../config/env';
import { OhlcvKline, MarketTrade } from './model';
import type { KlineInterval } from './model';

const chartQueryMaxMs = () => config.mongoMaxQueryTimeMs;

const INTERVAL_MS: Record<KlineInterval, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

export interface KlineRecord {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  tradeCount?: number;
}

export interface TradeRecord {
  time: Date;
  price: number;
  quantity: number;
  quoteQuantity?: number;
  tradeId: number | string;
  isBuyerMaker?: boolean;
}

export interface MarketTrendPoint {
  openTime: Date;
  value: number;
}

export interface MarketTrendOHLCPoint {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

type KlineDoc = { openTime: Date; close: number };
type KlineOhlcDoc = { openTime: Date; open: number; high: number; low: number; close: number };

function toKlineOhlcDoc(k: KlineRecord): KlineOhlcDoc {
  return {
    openTime: k.openTime,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
  };
}

function computeMarketTrendPoints(
  constituents: Array<{ symbol: string; marketCap: number }>,
  klineSets: Array<{ symbol: string; marketCap: number; docs: KlineDoc[] }>
): MarketTrendPoint[] {
  const indexByTimestamp = new Map<number, { weightedIndex: number; weight: number }>();
  for (const set of klineSets) {
    if (set.docs.length < 2) continue;
    const baseClose = Number(set.docs[0].close);
    if (!Number.isFinite(baseClose) || baseClose <= 0) continue;
    if (!Number.isFinite(set.marketCap) || set.marketCap <= 0) continue;

    for (const kline of set.docs) {
      const close = Number(kline.close);
      if (!Number.isFinite(close) || close <= 0) continue;
      const ts = new Date(kline.openTime).getTime();
      const ratio = close / baseClose;

      const existing = indexByTimestamp.get(ts) ?? { weightedIndex: 0, weight: 0 };
      existing.weightedIndex += ratio * set.marketCap;
      existing.weight += set.marketCap;
      indexByTimestamp.set(ts, existing);
    }
  }

  const rawPoints = Array.from(indexByTimestamp.entries())
    .map(([ts, v]) => ({
      openTime: new Date(ts),
      indexValue: v.weight > 0 ? v.weightedIndex / v.weight : 0,
    }))
    .filter((p) => Number.isFinite(p.indexValue) && p.indexValue > 0)
    .sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

  if (rawPoints.length < 2) return [];

  const latestIndexValue = rawPoints[rawPoints.length - 1].indexValue;
  if (!Number.isFinite(latestIndexValue) || latestIndexValue <= 0) return [];

  const totalMarketCap = constituents.reduce((sum, c) => sum + c.marketCap, 0);
  if (!Number.isFinite(totalMarketCap) || totalMarketCap <= 0) return [];
  const scale = totalMarketCap / latestIndexValue;

  return rawPoints.map((point) => ({
    openTime: point.openTime,
    value: point.indexValue * scale,
  }));
}

function computeMarketTrendOHLCPoints(
  constituents: Array<{ symbol: string; marketCap: number }>,
  klineSets: Array<{ symbol: string; marketCap: number; docs: KlineOhlcDoc[] }>
): MarketTrendOHLCPoint[] {
  const indexByTimestamp = new Map<
    number,
    { weightedOpen: number; weightedHigh: number; weightedLow: number; weightedClose: number; weight: number }
  >();

  for (const set of klineSets) {
    if (set.docs.length < 2) continue;
    const baseClose = Number(set.docs[0].close);
    if (!Number.isFinite(baseClose) || baseClose <= 0) continue;
    if (!Number.isFinite(set.marketCap) || set.marketCap <= 0) continue;

    for (const kline of set.docs) {
      const open = Number(kline.open);
      const high = Number(kline.high);
      const low = Number(kline.low);
      const close = Number(kline.close);
      if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) continue;

      const ts = new Date(kline.openTime).getTime();
      const existing = indexByTimestamp.get(ts) ?? {
        weightedOpen: 0,
        weightedHigh: 0,
        weightedLow: 0,
        weightedClose: 0,
        weight: 0,
      };
      existing.weightedOpen += (open / baseClose) * set.marketCap;
      existing.weightedHigh += (high / baseClose) * set.marketCap;
      existing.weightedLow += (low / baseClose) * set.marketCap;
      existing.weightedClose += (close / baseClose) * set.marketCap;
      existing.weight += set.marketCap;
      indexByTimestamp.set(ts, existing);
    }
  }

  const rawPoints = Array.from(indexByTimestamp.entries())
    .map(([ts, v]) => {
      if (v.weight <= 0) return null;
      return {
        openTime: new Date(ts),
        open: v.weightedOpen / v.weight,
        high: v.weightedHigh / v.weight,
        low: v.weightedLow / v.weight,
        close: v.weightedClose / v.weight,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter((p) => [p.open, p.high, p.low, p.close].every((v) => Number.isFinite(v) && v > 0))
    .sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

  if (rawPoints.length < 2) return [];

  const latestCloseIndex = rawPoints[rawPoints.length - 1].close;
  if (!Number.isFinite(latestCloseIndex) || latestCloseIndex <= 0) return [];

  const totalMarketCap = constituents.reduce((sum, c) => sum + c.marketCap, 0);
  if (!Number.isFinite(totalMarketCap) || totalMarketCap <= 0) return [];
  const scale = totalMarketCap / latestCloseIndex;

  return rawPoints.map((point) => {
    const open = point.open * scale;
    const high = point.high * scale;
    const low = point.low * scale;
    const close = point.close * scale;
    return {
      openTime: point.openTime,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
    };
  });
}

export const chartRepository = {
  async findKlines(params: {
    exchange: string;
    symbol: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit?: number;
  }): Promise<KlineRecord[]> {
    const { exchange, symbol, interval, from, to, limit = 1000 } = params;
    const query = {
      'meta.exchange': exchange,
      'meta.symbol': symbol.toUpperCase(),
      'meta.interval': interval,
      openTime: { $gte: from, $lte: to },
    };
    const docs = await OhlcvKline.find(query)
      .maxTimeMS(chartQueryMaxMs())
      // Pull latest candles first so limit returns most recent window.
      .sort({ openTime: -1 })
      .limit(limit)
      .lean();

    // API consumers expect time-series order oldest -> newest.
    return docs.reverse().map((d) => ({
      openTime: d.openTime,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
      quoteVolume: d.quoteVolume,
      tradeCount: d.tradeCount,
    }));
  },

  async findTrades(params: {
    exchange: string;
    symbol: string;
    from: Date;
    to: Date;
    limit?: number;
    dataType?: 'trade' | 'aggTrade';
    sortAsc?: boolean;
  }): Promise<TradeRecord[]> {
    const { exchange, symbol, from, to, limit = 1000, dataType = 'aggTrade', sortAsc = false } = params;
    const query = {
      'meta.exchange': exchange,
      'meta.symbol': symbol.toUpperCase(),
      'meta.dataType': dataType,
      time: { $gte: from, $lte: to },
    };
    const docs = await MarketTrade.find(query)
      .maxTimeMS(chartQueryMaxMs())
      .sort({ time: sortAsc ? 1 : -1 })
      .limit(Math.min(limit, 50000))
      .lean();

    return docs.map((d) => ({
      time: d.time,
      price: d.price,
      quantity: d.quantity,
      quoteQuantity: d.quoteQuantity,
      tradeId: d.tradeId,
      isBuyerMaker: d.isBuyerMaker,
    }));
  },

  /**
   * Build OHLCV buckets from aggTrades when stored klines are missing (same logic as chartService).
   */
  async aggregateKlinesFromTrades(params: {
    exchange: string;
    symbol: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<KlineRecord[]> {
    const { exchange, symbol, interval, from, to, limit } = params;
    const trades = await this.findTrades({
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
  },

  async findMarketTrend(params: {
    exchange: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit: number;
    constituents: Array<{ symbol: string; marketCap: number }>;
  }): Promise<MarketTrendPoint[]> {
    const { exchange, interval, from, to, limit, constituents } = params;
    if (constituents.length === 0) return [];

    const limit8 = pLimit(8);
    const klineSets = await Promise.all(
      constituents.map((coin) => limit8(async () => {
        const query = {
          'meta.exchange': exchange,
          'meta.symbol': coin.symbol.toUpperCase(),
          'meta.interval': interval,
          openTime: { $gte: from, $lte: to },
        };
        const raw = await OhlcvKline.find(query)
          .maxTimeMS(chartQueryMaxMs())
          .sort({ openTime: -1 })
          .limit(limit)
          .lean();

        let docs: KlineDoc[] = raw.reverse().map((d) => ({ openTime: d.openTime, close: d.close }));
        if (docs.length < 2) {
          const fromTrades = await this.aggregateKlinesFromTrades({
            exchange,
            symbol: coin.symbol,
            interval,
            from,
            to,
            limit,
          });
          docs = fromTrades.map((k) => ({ openTime: k.openTime, close: k.close }));
        }

        return {
          symbol: coin.symbol,
          marketCap: coin.marketCap,
          docs,
        };
      }))
    );

    return computeMarketTrendPoints(constituents, klineSets);
  },

  /**
   * Single aggregation round-trip: group klines per symbol, then same weighted index as v1.
   */
  async findMarketTrendBatched(params: {
    exchange: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit: number;
    constituents: Array<{ symbol: string; marketCap: number }>;
  }): Promise<MarketTrendPoint[]> {
    const { exchange, interval, from, to, limit, constituents } = params;
    if (constituents.length === 0) return [];

    const symbols = constituents.map((c) => c.symbol.toUpperCase());
    const capBySymbol = new Map(
      constituents.map((c) => [c.symbol.toUpperCase(), c.marketCap] as const)
    );

    const grouped = (await OhlcvKline.aggregate([
      {
        $match: {
          'meta.exchange': exchange,
          'meta.interval': interval,
          'meta.symbol': { $in: symbols },
          openTime: { $gte: from, $lte: to },
        },
      },
      { $sort: { openTime: -1 } },
      {
        $group: {
          _id: '$meta.symbol',
          docs: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          symbol: '$_id',
          docs: { $slice: ['$docs', limit] },
        },
      },
    ]).option({ maxTimeMS: chartQueryMaxMs() })) as Array<{ symbol: string; docs: KlineDoc[] }>;

    const groupedBySym = new Map(
      grouped.map((g) => [String(g.symbol).toUpperCase(), g] as const)
    );

    const limit8 = pLimit(8);
    const klineSets = await Promise.all(
      constituents.map((c) => limit8(async () => {
        const sym = c.symbol.toUpperCase();
        const g = groupedBySym.get(sym);
        let docs: KlineDoc[] = g
          ? (g.docs as KlineDoc[]).slice().reverse()
          : [];
        if (docs.length < 2) {
          const fromTrades = await this.aggregateKlinesFromTrades({
            exchange,
            symbol: c.symbol,
            interval,
            from,
            to,
            limit,
          });
          docs = fromTrades.map((k) => ({ openTime: k.openTime, close: k.close }));
        }
        return {
          symbol: sym,
          marketCap: capBySymbol.get(sym) ?? 0,
          docs,
        };
      }))
    );

    return computeMarketTrendPoints(constituents, klineSets);
  },

  async findMarketTrendOHLC(params: {
    exchange: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit: number;
    constituents: Array<{ symbol: string; marketCap: number }>;
  }): Promise<MarketTrendOHLCPoint[]> {
    const { exchange, interval, from, to, limit, constituents } = params;
    if (constituents.length === 0) return [];

    const limit8 = pLimit(8);
    const klineSets = await Promise.all(
      constituents.map((coin) => limit8(async () => {
        const query = {
          'meta.exchange': exchange,
          'meta.symbol': coin.symbol.toUpperCase(),
          'meta.interval': interval,
          openTime: { $gte: from, $lte: to },
        };
        const raw = await OhlcvKline.find(query)
          .maxTimeMS(chartQueryMaxMs())
          .sort({ openTime: -1 })
          .limit(limit)
          .lean();

        let docs: KlineOhlcDoc[] = raw.reverse().map((d) => ({
          openTime: d.openTime,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));
        if (docs.length < 2) {
          const fromTrades = await this.aggregateKlinesFromTrades({
            exchange,
            symbol: coin.symbol,
            interval,
            from,
            to,
            limit,
          });
          docs = fromTrades.map(toKlineOhlcDoc);
        }

        return {
          symbol: coin.symbol,
          marketCap: coin.marketCap,
          docs,
        };
      }))
    );

    return computeMarketTrendOHLCPoints(constituents, klineSets);
  },

  /**
   * Batched Mongo reads for market-cap OHLC index (candle view only).
   */
  async findMarketTrendOHLCBatched(params: {
    exchange: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit: number;
    constituents: Array<{ symbol: string; marketCap: number }>;
  }): Promise<MarketTrendOHLCPoint[]> {
    const { exchange, interval, from, to, limit, constituents } = params;
    if (constituents.length === 0) return [];

    const symbols = constituents.map((c) => c.symbol.toUpperCase());
    const capBySymbol = new Map(
      constituents.map((c) => [c.symbol.toUpperCase(), c.marketCap] as const)
    );

    const grouped = (await OhlcvKline.aggregate([
      {
        $match: {
          'meta.exchange': exchange,
          'meta.interval': interval,
          'meta.symbol': { $in: symbols },
          openTime: { $gte: from, $lte: to },
        },
      },
      { $sort: { openTime: -1 } },
      {
        $group: {
          _id: '$meta.symbol',
          docs: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          symbol: '$_id',
          docs: { $slice: ['$docs', limit] },
        },
      },
    ]).option({ maxTimeMS: chartQueryMaxMs() })) as Array<{ symbol: string; docs: KlineOhlcDoc[] }>;

    const groupedBySym = new Map(
      grouped.map((g) => [String(g.symbol).toUpperCase(), g] as const)
    );

    const limit8 = pLimit(8);
    const klineSets = await Promise.all(
      constituents.map((c) => limit8(async () => {
        const sym = c.symbol.toUpperCase();
        const g = groupedBySym.get(sym);
        let docs: KlineOhlcDoc[] = g
          ? (g.docs as KlineOhlcDoc[]).slice().reverse()
          : [];
        if (docs.length < 2) {
          const fromTrades = await this.aggregateKlinesFromTrades({
            exchange,
            symbol: c.symbol,
            interval,
            from,
            to,
            limit,
          });
          docs = fromTrades.map(toKlineOhlcDoc);
        }
        return {
          symbol: sym,
          marketCap: capBySymbol.get(sym) ?? 0,
          docs,
        };
      }))
    );

    return computeMarketTrendOHLCPoints(constituents, klineSets);
  },
};
