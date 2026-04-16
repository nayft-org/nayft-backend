import mongoose, { Schema, Document } from 'mongoose';

export type KlineInterval = '1m' | '5m' | '1h' | '1d' | '1w';

export interface IOhlcvMeta {
  exchange: string;
  symbol: string;
  interval: KlineInterval;
}

export interface IOhlcvKline extends Document {
  meta: IOhlcvMeta;
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  tradeCount?: number;
}

const ohlcvKlineSchema = new Schema<IOhlcvKline>(
  {
    meta: {
      exchange: { type: String, required: true },
      symbol: { type: String, required: true },
      interval: { type: String, required: true, enum: ['1m', '5m', '1h', '1d', '1w'] },
    },
    openTime: { type: Date, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
    quoteVolume: { type: Number },
    tradeCount: { type: Number },
  },
  { timestamps: false }
);

ohlcvKlineSchema.index({ 'meta.exchange': 1, 'meta.symbol': 1, 'meta.interval': 1, openTime: -1 }, { unique: true });

export const OhlcvKline = mongoose.model<IOhlcvKline>(
  'OhlcvKline',
  ohlcvKlineSchema,
  'ohlcv_klines'
);

// --- Market Trades (aggTrade / trade) ---

export interface IMarketTradeMeta {
  exchange: string;
  symbol: string;
  dataType: 'trade' | 'aggTrade';
}

export interface IMarketTrade extends Document {
  meta: IMarketTradeMeta;
  time: Date;
  price: number;
  quantity: number;
  quoteQuantity?: number;
  tradeId: number | string;
  isBuyerMaker?: boolean;
}

const marketTradeSchema = new Schema<IMarketTrade>(
  {
    meta: {
      exchange: { type: String, required: true },
      symbol: { type: String, required: true },
      dataType: { type: String, required: true, enum: ['trade', 'aggTrade'] },
    },
    time: { type: Date, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    quoteQuantity: { type: Number },
    tradeId: { type: Schema.Types.Mixed, required: true },
    isBuyerMaker: { type: Boolean },
  },
  {
    timeseries: {
      timeField: 'time',
      metaField: 'meta',
      granularity: 'seconds',
      expireAfterSeconds: 86400,
    },
  }
);

marketTradeSchema.index(
  { 'meta.exchange': 1, 'meta.symbol': 1, 'meta.dataType': 1, time: -1 },
  { background: true, name: 'trade_lookup_desc' }
);

export const MarketTrade = mongoose.model<IMarketTrade>(
  'MarketTrade',
  marketTradeSchema,
  'market_trades'
);
