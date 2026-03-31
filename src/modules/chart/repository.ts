import { OhlcvKline, MarketTrade } from './model';
import type { KlineInterval } from './model';

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

type KlineDoc = { openTime: Date; close: number };

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
    const docs = await OhlcvKline.find({
      'meta.exchange': exchange,
      'meta.symbol': symbol.toUpperCase(),
      'meta.interval': interval,
      openTime: { $gte: from, $lte: to },
    })
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
    const docs = await MarketTrade.find({
      'meta.exchange': exchange,
      'meta.symbol': symbol.toUpperCase(),
      'meta.dataType': dataType,
      time: { $gte: from, $lte: to },
    })
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

    const klineSets = await Promise.all(
      constituents.map(async (coin) => {
        const docs = await OhlcvKline.find({
          'meta.exchange': exchange,
          'meta.symbol': coin.symbol.toUpperCase(),
          'meta.interval': interval,
          openTime: { $gte: from, $lte: to },
        })
          .sort({ openTime: -1 })
          .limit(limit)
          .lean();

        return {
          symbol: coin.symbol,
          marketCap: coin.marketCap,
          docs: docs.reverse(),
        };
      })
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
    ])) as Array<{ symbol: string; docs: KlineDoc[] }>;

    const klineSets = grouped.map((g) => {
      const sym = String(g.symbol).toUpperCase();
      const docs = (g.docs as KlineDoc[]).slice().reverse();
      return {
        symbol: sym,
        marketCap: capBySymbol.get(sym) ?? 0,
        docs,
      };
    });

    return computeMarketTrendPoints(constituents, klineSets);
  },
};
