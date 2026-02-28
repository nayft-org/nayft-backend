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
      .sort({ openTime: 1 })
      .limit(limit)
      .lean();

    return docs.map((d) => ({
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
  }): Promise<TradeRecord[]> {
    const { exchange, symbol, from, to, limit = 1000, dataType = 'aggTrade' } = params;
    const docs = await MarketTrade.find({
      'meta.exchange': exchange,
      'meta.symbol': symbol.toUpperCase(),
      'meta.dataType': dataType,
      time: { $gte: from, $lte: to },
    })
      .sort({ time: -1 })
      .limit(limit)
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
};
